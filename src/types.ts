// types.ts
export interface Bindings {
	ARCHIVER_KEY: string
	ARCHIVE_BUCKET: R2Bucket
	STATIC_URL: string
}

export interface ArchiveRequest {
	url: string
	archiveKey: string
}

export interface ArchivedAsset {
	url: string
	type: AssetType
	path: string
	parentUrl?: string
	isExternal?: boolean
	depth?: number
}

export type AssetType =
	| 'html'
	| 'css'
	| 'js'
	| 'image'
	| 'font'
	| 'iframe'
	| 'icon'
	| 'media'
	| 'json'
	| 'xml'
	| 'pdf'
	| 'other'

export interface CrawlOptions {
	maxDepth?: number
	includeFrames?: boolean
	includeStyles?: boolean
	includeScripts?: boolean
	includeImages?: boolean
	includeFonts?: boolean
	timeout?: number
}

export interface ProcessedAsset {
	content: ArrayBuffer | string
	contentType: string
	metadata: {
		originalUrl: string
		assetType: AssetType
		parentUrl?: string
		isFrameContent?: boolean
	}
}
