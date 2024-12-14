import { WebCrawler } from './crawler'
import { ContentProcessor } from './processor'
import { getDomain, formatDate, getContentType } from '../utils'

export class ArchiverService {
	constructor(
		private bucket: R2Bucket,
		private staticUrl: string
	) {}

	async archiveUrl(url: string): Promise<string> {
		const domain = getDomain(url)
		const date = formatDate()

		const crawler = new WebCrawler(url)
		const processor = new ContentProcessor(this.staticUrl, domain, date)

		try {
			console.log(`Starting crawl of ${url}`)
			const assets = await crawler.crawl(url)
			console.log(`Found ${assets.length} assets to process`)

			const assetsByType = assets.reduce(
				(acc, asset) => {
					acc[asset.type] = (acc[asset.type] || 0) + 1
					return acc
				},
				{} as Record<string, number>
			)

			console.log('Assets by type:', assetsByType)

			const results = await Promise.allSettled(
				assets.map(async (asset) => {
					try {
						// Skip external iframes
						if (asset.type === 'iframe' && asset.isExternal) {
							console.log(`Skipping external iframe: ${asset.url}`)
							return null
						}

						// Fetch and process the asset
						console.log(`Processing ${asset.type}: ${asset.url}`)
						const response = await fetch(asset.url)
						if (!response.ok) throw new Error(`HTTP ${response.status}`)

						let content: ArrayBuffer | string
						const contentType = response.headers.get('content-type') || ''

						if (asset.type === 'html' || asset.type === 'css') {
							const text = await response.text()
							content =
								asset.type === 'html'
									? processor.processHtml(text, asset.url)
									: processor.processCss(text, asset.url)
						} else {
							// Store other assets as-is
							content = await response.arrayBuffer()
						}

						const storagePath = `${domain}/${date}${asset.path}`

						await this.bucket.put(storagePath, content, {
							httpMetadata: {
								contentType: getContentType(asset.path)
							},
							customMetadata: {
								originalUrl: asset.url,
								archivedAt: date,
								assetType: asset.type,
								domain: domain
							}
						})

						console.log(`Stored: ${storagePath}`)
						return storagePath
					} catch (error) {
						console.error(`Failed to process asset: ${asset.url}`, error)
						throw error
					}
				})
			)

			// Check results and provide detailed failure information
			const failures = results.filter(
				(r): r is PromiseRejectedResult => r.status === 'rejected'
			)
			if (failures.length > 0) {
				console.warn(`${failures.length} assets failed to archive:`)
				failures.forEach((f) => console.error(f.reason))
			}

			return `${this.staticUrl}/${domain}/${date}/index.html`
		} catch (error) {
			console.error('Archive process failed:', error)
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			throw new Error(`Failed to archive ${url}: ${errorMessage}`)
		}
	}

	async listArchives(domain: string): Promise<string[]> {
		try {
			const objects = await this.bucket.list({
				prefix: `${domain}/`,
				delimiter: '/'
			})

			// Extract unique dates from the paths
			const dates = new Set<string>()

			// Process both common prefixes and objects
			if (objects.delimitedPrefixes) {
				objects.delimitedPrefixes.forEach((prefix) => {
					const date = prefix.split('/')[1]
					if (date) dates.add(date)
				})
			}

			objects.objects.forEach((obj) => {
				const [, date] = obj.key.split('/')
				if (date) dates.add(date)
			})

			return Array.from(dates).sort().reverse()
		} catch (error) {
			console.error(`Failed to list archives for ${domain}:`, error)
			throw error
		}
	}

	async getDomainCount(): Promise<number> {
		try {
			const objects = await this.bucket.list({
				delimiter: '/'
			})

			// Use delimitedPrefixes to get unique top-level directories (domains)
			return objects.delimitedPrefixes?.length || 0
		} catch (error) {
			console.error('Failed to get domain count:', error)
			return 0
		}
	}
}
