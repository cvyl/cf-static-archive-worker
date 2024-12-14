import { ArchivedAsset } from '../types'
import { resolveUrl } from '../utils'

export class ContentProcessor {
	constructor(
		private staticUrl: string,
		private domain: string,
		private date: string
	) {}

	processHtml(html: string, baseUrl: string): string {
		html = html.replace(
			/<a\s+[^>]*href=["'](.*?)["'][^>]*>/g,
			(match, path) => {
				if (
					!path ||
					path.startsWith('#') ||
					path.startsWith('javascript:') ||
					path.startsWith('data:') ||
					path.startsWith('blob:') ||
					path.startsWith('mailto:') ||
					path.startsWith('tel:') ||
					path.startsWith('http://') ||
					path.startsWith('https://') ||
					path.startsWith('//')
				) {
					return match
				}

				try {
					const fullUrl = resolveUrl(path, baseUrl)
					const urlObj = new URL(fullUrl)
					const baseUrlObj = new URL(baseUrl)

					if (urlObj.hostname === baseUrlObj.hostname) {
						const archivePath = this.getArchivePath(fullUrl)
						return match.replace(path, archivePath)
					}
					return match
				} catch (error) {
					console.error(`Failed to process anchor URL: ${path}`, error)
					return match
				}
			}
		)

		// Then handle other patterns
		const patterns = [
			/src=["'](.*?)["']/g,
			/(?<!<a[^>]*)\shref=["'](.*?)["']/g,
			/url\(["']?(.*?)["']?\)/g,
			/srcset=["'](.*?)["']/g,
			/data-src=["'](.*?)["']/g,
			/\s(ping|poster|background)=["'](.*?)["']/g
		]

		return patterns.reduce((content, pattern) => {
			return content.replace(pattern, (match, path, offset, string) => {
				if (
					!path ||
					path.startsWith('#') ||
					path.startsWith('javascript:') ||
					path.startsWith('data:') ||
					path.startsWith('blob:') ||
					path.startsWith('mailto:') ||
					path.startsWith('tel:')
				) {
					return match
				}

				try {
					// Handle srcset differently as it can contain multiple URLs
					if (match.startsWith('srcset')) {
						return this.processSrcSet(match, path, baseUrl)
					}

					const fullUrl = resolveUrl(path, baseUrl)
					const archivePath = this.getArchivePath(fullUrl)

					// Preserve the original match syntax
					if (match.startsWith('url(')) {
						return `url("${archivePath}")`
					} else if (match.startsWith('href')) {
						return `href="${archivePath}"`
					} else {
						return match.replace(path, archivePath)
					}
				} catch (error) {
					console.error(`Failed to process URL: ${path}`, error)
					return match
				}
			})
		}, html)
	}
	processSrcSet(match: string, srcset: string, baseUrl: string): string {
		try {
			const sources = srcset.split(',').map((src) => {
				const [url, ...descriptors] = src.trim().split(/\s+/)
				try {
					const fullUrl = resolveUrl(url, baseUrl)
					const archivePath = this.getArchivePath(fullUrl)
					return [archivePath, ...descriptors].join(' ')
				} catch {
					return src.trim()
				}
			})

			return `srcset="${sources.join(', ')}"`
		} catch (error) {
			console.error('Failed to process srcset:', error)
			return match
		}
	}

	processCss(css: string, baseUrl: string): string {
		const urlPattern = /url\(["']?(.*?)["']?\)/g
		return css.replace(urlPattern, (match, path) => {
			if (!path || path.startsWith('data:')) return match

			try {
				const fullUrl = resolveUrl(path, baseUrl)
				const archivePath = this.getArchivePath(fullUrl)
				return `url("${archivePath}")`
			} catch (error) {
				console.error(`Failed to process CSS URL: ${path}`, error)
				return match
			}
		})
	}

	private getArchivePath(url: string): string {
		try {
			const urlObj = new URL(url)
			return `${this.staticUrl}/${this.domain}/${this.date}${urlObj.pathname}`
		} catch (error) {
			console.error(`Failed to generate archive path for: ${url}`, error)
			return url
		}
	}

	async processAsset(asset: ArchivedAsset): Promise<ArrayBuffer | string> {
		try {
			const response = await fetch(asset.url)

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`)
			}

			const contentType = response.headers.get('content-type') || ''

			// Process text-based assets
			if (
				contentType.includes('text/') ||
				contentType.includes('application/javascript') ||
				contentType.includes('application/json') ||
				contentType.includes('application/xml') ||
				contentType.includes('+xml')
			) {
				const text = await response.text()

				// Process based on content type
				if (contentType.includes('text/html')) {
					return this.processHtml(text, asset.url)
				} else if (contentType.includes('text/css')) {
					return this.processCss(text, asset.url)
				}

				return text
			}

			// Return binary assets as-is
			return await response.arrayBuffer()
		} catch (error) {
			console.error(`Failed to process asset: ${asset.url}`, error)
			throw error
		}
	}
}
