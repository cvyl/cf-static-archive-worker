import { ArchivedAsset } from '../types'
import { resolveUrl, sanitizePath } from '../utils'

export class WebCrawler {
	private visited = new Set<string>()
	private assets = new Map<string, ArchivedAsset>()
	private baseUrlObj: URL
	private maxDepth = 5 // Prevent infinite recursion, this is a simple crawler

	constructor(private initialUrl: string) {
		this.baseUrlObj = new URL(initialUrl)
	}

	async crawl(url: string): Promise<ArchivedAsset[]> {
		try {
			await this.processHtmlPage(url, '/index.html', 0)
			return Array.from(this.assets.values())
		} catch (error) {
			console.error('Crawl failed:', error)
			throw error
		}
	}

	private async processHtmlPage(
		url: string,
		suggestedPath: string,
		depth: number
	): Promise<void> {
		if (this.visited.has(url) || depth > this.maxDepth) return
		this.visited.add(url)

		try {
			console.log(`Processing HTML page: ${url} (depth: ${depth})`)
			const response = await fetch(url)
			const html = await response.text()

			this.addAsset({
				url,
				type: 'html',
				path: suggestedPath,
				depth: depth
			})

			await this.processPage(html, url, depth)
			await this.processIframes(html, url, depth)

			await this.processInternalLinks(html, url, depth)
		} catch (error) {
			console.error(`Failed to process HTML page: ${url}`, error)
		}
	}

	private async processInternalLinks(
		html: string,
		baseUrl: string,
		depth: number
	): Promise<void> {
		const linkPattern = /<a[^>]*href=["'](.*?)["'][^>]*>/g
		let match

		while ((match = linkPattern.exec(html)) !== null) {
			try {
				const href = match[1]
				if (
					!href ||
					href.startsWith('#') ||
					href.startsWith('data:') ||
					href.startsWith('mailto:') ||
					href.startsWith('tel:') ||
					href.startsWith('javascript:')
				) {
					continue
				}

				const fullUrl = resolveUrl(href, baseUrl)
				const linkUrlObj = new URL(fullUrl)

				// Only process links from the same domain and that end in .html or /
				if (linkUrlObj.hostname === this.baseUrlObj.hostname) {
					const path = linkUrlObj.pathname
					if (
						path.endsWith('.html') ||
						path.endsWith('/') ||
						!path.includes('.')
					) {
						const htmlPath = path.endsWith('.html')
							? path
							: path.endsWith('/')
								? `${path}index.html`
								: `${path}/index.html`

						await this.processHtmlPage(fullUrl, htmlPath, depth + 1)
					}
				}
			} catch (error) {
				console.error(`Failed to process link: ${match[1]}`, error)
			}
		}
	}

	private async processIframes(
		html: string,
		baseUrl: string,
		depth: number
	): Promise<void> {
		const iframePattern = /<iframe[^>]*src=["'](.*?)["']/g
		let match

		while ((match = iframePattern.exec(html)) !== null) {
			try {
				const iframeSrc = match[1]
				if (!iframeSrc || iframeSrc.startsWith('data:')) continue

				const fullUrl = resolveUrl(iframeSrc, baseUrl)
				const iframeUrlObj = new URL(fullUrl)

				// Only process iframes from the same domain
				if (iframeUrlObj.hostname === this.baseUrlObj.hostname) {
					const iframePath = iframeUrlObj.pathname
					const htmlPath = iframePath.endsWith('.html')
						? iframePath
						: iframePath.endsWith('/')
							? `${iframePath}index.html`
							: `${iframePath}/index.html`

					await this.processHtmlPage(fullUrl, htmlPath, depth + 1)
				} else {
					// For external iframes, just record them without processing
					this.addAsset({
						url: fullUrl,
						type: 'iframe',
						path: new URL(fullUrl).pathname,
						isExternal: true,
						depth: depth
					})
				}
			} catch (error) {
				console.error(`Failed to process iframe: ${match[1]}`, error)
			}
		}
	}

	private async processPage(html: string, baseUrl: string, depth: number) {
		// Process CSS files
		const cssLinks = this.extractUrls(html, /href=["'](.*?\.css[^"']*)["']/g)
		for (const cssUrl of cssLinks) {
			try {
				const fullUrl = resolveUrl(cssUrl, baseUrl)
				if (!this.visited.has(fullUrl)) {
					this.visited.add(fullUrl)

					const cssResponse = await fetch(fullUrl)
					const cssContent = await cssResponse.text()

					const cssPath = new URL(fullUrl).pathname
					this.addAsset({
						url: fullUrl,
						type: 'css',
						path: cssPath,
						depth: depth
					})

					await this.processCssContent(cssContent, fullUrl)
				}
			} catch (error) {
				console.error(`Failed to process CSS: ${cssUrl}`, error)
			}
		}

		// Process other assets (JS, images, fonts)
		const assetPatterns = [
			{ pattern: /src=["'](.*?\.js[^"']*)["']/g, type: 'js' as const },
			{
				pattern: /src=["'](.*?\.(jpg|jpeg|png|gif|webp|svg)[^"']*)["']/g,
				type: 'image' as const
			},
			{
				pattern: /url\(["']?(.*?\.(jpg|jpeg|png|gif|webp)[^"']*?)["']?\)/g,
				type: 'image' as const
			},
			{
				pattern: /src=["'](.*?\.(woff2?|ttf|eot)[^"']*)["']/g,
				type: 'font' as const
			},
			{
				pattern: /src=["'](.*?\.(mp3|mp4|webm|pdf)[^"']*)["']/g,
				type: 'media' as const
			}
		]

		for (const { pattern, type } of assetPatterns) {
			const urls = this.extractUrls(html, pattern)
			for (const assetUrl of urls) {
				try {
					const fullUrl = resolveUrl(assetUrl, baseUrl)
					if (!this.visited.has(fullUrl)) {
						this.visited.add(fullUrl)
						this.addAsset({
							url: fullUrl,
							type,
							path: new URL(fullUrl).pathname,
							depth: depth
						})
					}
				} catch (error) {
					console.error(`Failed to process asset: ${assetUrl}`, error)
				}
			}
		}
	}

	private async processCssContent(css: string, baseUrl: string) {
		// Extract and process all URLs from the CSS content
		const urlPattern = /url\(["']?(.*?)["']?\)/g
		const urls = this.extractUrls(css, urlPattern)

		for (const url of urls) {
			try {
				const fullUrl = resolveUrl(url, baseUrl)
				if (!this.visited.has(fullUrl)) {
					this.visited.add(fullUrl)

					// Determine asset type from extension
					const path = new URL(fullUrl).pathname
					const type = path.match(/\.(jpg|jpeg|png|gif|webp)$/i)
						? 'image'
						: path.match(/\.(woff2?|ttf|eot)$/i)
							? 'font'
							: 'other'

					this.addAsset({
						url: fullUrl,
						type,
						path
					})
				}
			} catch (error) {
				console.error(`Failed to process CSS asset: ${url}`, error)
			}
		}
	}

	private extractUrls(content: string, pattern: RegExp): string[] {
		const urls: string[] = []
		let match
		while ((match = pattern.exec(content)) !== null) {
			if (match[1] && !match[1].startsWith('data:')) {
				urls.push(match[1])
			}
		}
		return urls
	}

	private addAsset(asset: ArchivedAsset & { depth?: number }) {
		if (!asset.path.startsWith('/')) {
			asset.path = '/' + asset.path
		}
		asset.path = sanitizePath(asset.path)
		if (!this.assets.has(asset.url)) {
			const { depth, ...assetWithoutDepth } = asset
			this.assets.set(asset.url, assetWithoutDepth)
		}
	}
}
