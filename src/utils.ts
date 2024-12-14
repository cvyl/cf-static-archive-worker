import { AssetType } from './types'

export function getDomain(url: string): string {
	const urlObj = new URL(url)
	return urlObj.hostname.replace(/^www\./, '')
}

export function formatDate(): string {
	const date = new Date()
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
}

export function getContentType(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase()
	const contentTypes: Record<string, string> = {
		html: 'text/html',
		css: 'text/css',
		js: 'application/javascript',
		json: 'application/json',
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		ico: 'image/x-icon',
		woff: 'font/woff',
		woff2: 'font/woff2',
		ttf: 'font/ttf',
		eot: 'application/vnd.ms-fontobject',
		mp4: 'video/mp4',
		mp3: 'audio/mpeg',
		pdf: 'application/pdf',
		xml: 'application/xml',
		txt: 'text/plain'
	}
	return ext
		? contentTypes[ext] || 'application/octet-stream'
		: 'application/octet-stream'
}

export function getAssetType(path: string): AssetType {
	const ext = path.split('.').pop()?.toLowerCase()
	if (!ext) return 'other'

	const typeMap: Record<string, AssetType> = {
		html: 'html',
		htm: 'html',
		css: 'css',
		js: 'js',
		jpg: 'image',
		jpeg: 'image',
		png: 'image',
		gif: 'image',
		webp: 'image',
		svg: 'image',
		woff: 'font',
		woff2: 'font',
		ttf: 'font',
		eot: 'font',
		ico: 'icon',
		mp4: 'media',
		mp3: 'media',
		webm: 'media',
		json: 'json',
		xml: 'xml',
		pdf: 'pdf'
	}

	return typeMap[ext] || 'other'
}

export function resolveUrl(path: string, baseUrl: string): string {
	if (path.startsWith('data:') || path.startsWith('blob:')) {
		throw new Error('Unsupported URL scheme')
	}

	if (path.startsWith('http')) {
		return path
	} else if (path.startsWith('//')) {
		return `https:${path}`
	}

	return new URL(path, baseUrl).href
}

export function sanitizePath(path: string): string {
	path = path.split(/[?#]/)[0]

	if (!path.startsWith('/')) {
		path = '/' + path
	}

	path = path.replace(/\/+/g, '/')

	if (!path.includes('.') && !path.endsWith('/')) {
		path = path + '/index.html'
	} else if (path.endsWith('/')) {
		path = path + 'index.html'
	}

	return path
}

export async function fetchWithTimeout(
	url: string,
	timeout = 30000
): Promise<Response> {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), timeout)

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 Archive Bot'
			}
		})
		clearTimeout(timeoutId)
		return response
	} catch (error) {
		clearTimeout(timeoutId)
		throw error
	}
}
