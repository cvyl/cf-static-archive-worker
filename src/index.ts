import { html } from 'hono/html'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ArchiverService } from './services/archiver'
import { getContentType, getDomain } from './utils'
import type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', cors())

const getArchiver = (c: any) =>
	new ArchiverService(c.env.ARCHIVE_BUCKET, c.env.STATIC_URL)

app.get('/', async (c) => {
	const archiver = getArchiver(c)
	const domainCount = await archiver.getDomainCount()

	return c.html(html`
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Website Archiver</title>
				<style>
					body {
						font-family: system-ui, sans-serif;
						max-width: 800px;
						margin: 2rem auto;
						padding: 0 1rem;
						line-height: 1.6;
					}
					form {
						margin: 2rem 0;
						padding: 1.5rem;
						border: 1px solid #ddd;
						border-radius: 8px;
						background: #f8f9fa;
					}
					input[type='url'] {
						width: 100%;
						padding: 0.75rem;
						margin: 0.5rem 0;
						border: 1px solid #ddd;
						border-radius: 4px;
						font-size: 1rem;
					}
					button {
						background: #0070f3;
						color: white;
						border: none;
						padding: 0.75rem 1.5rem;
						border-radius: 4px;
						cursor: pointer;
						font-size: 1rem;
						transition: background 0.2s;
					}
					button:hover {
						background: #0051cc;
					}
					.stats {
						padding: 1rem;
						background: #e9ecef;
						border-radius: 4px;
						margin-bottom: 2rem;
					}
					#result {
						margin-top: 1rem;
						padding: 1rem;
						border-radius: 4px;
					}
					.error {
						color: #dc3545;
						background: #f8d7da;
					}
					.success {
						color: #28a745;
						background: #d4edda;
					}
				</style>
			</head>
			<body>
				<h1>Website Archiver</h1>
				<div class="stats">
					<p>Currently archiving ${domainCount} websites</p>
				</div>

				<form id="archiveForm">
					<div>
						<label for="url">Enter website URL:</label>
						<input
							type="url"
							id="url"
							required
							placeholder="https://example.com"
						/>
					</div>
					<button type="submit">Archive Website</button>
				</form>

				<div id="result"></div>

				<script>
					document.getElementById('archiveForm').onsubmit = async (e) => {
						e.preventDefault()
						const result = document.getElementById('result')
						const url = document.getElementById('url').value
						const button = e.target.querySelector('button')

						try {
							button.disabled = true
							button.textContent = 'Archiving...'
							result.textContent = 'Starting archive process...'
							result.className = ''

							const res = await fetch('/archive', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									url,
									archiveKey: '${c.env.ARCHIVER_KEY}'
								})
							})

							const data = await res.json()

							if (data.success) {
								result.className = 'success'
								result.textContent =
									'Successfully archived! Redirecting to archive...'
								setTimeout(() => (window.location.href = data.previewUrl), 1500)
							} else {
								result.className = 'error'
								result.textContent = data.error || 'Failed to archive'
							}
						} catch (err) {
							result.className = 'error'
							result.textContent = 'Failed to archive: ' + err.message
						} finally {
							button.disabled = false
							button.textContent = 'Archive Website'
						}
					}
				</script>
			</body>
		</html>
	`)
})

app.get('/:domain', async (c) => {
	const domain = c.req.param('domain')
	const archiver = getArchiver(c)

	try {
		if (!domain.includes('/')) {
			const dates = await archiver.listArchives(domain)

			const datesList = dates
				.map(
					(date) =>
						`<li>
          <a class="snapshot-link" href="/${domain}/${date}/index.html">
            Snapshot from ${date}
          </a>
        </li>`
				)
				.join('')

			return c.html(html`
				<!DOCTYPE html>
				<html lang="en">
					<head>
						<meta charset="UTF-8" />
						<meta
							name="viewport"
							content="width=device-width, initial-scale=1.0"
						/>
						<title>Archives for ${domain}</title>
						<style>
							body {
								font-family: system-ui, sans-serif;
								max-width: 800px;
								margin: 2rem auto;
								padding: 0 1rem;
								line-height: 1.6;
							}
							.snapshots {
								list-style: none;
								padding: 0;
							}
							.snapshot-link {
								display: block;
								padding: 1rem;
								margin: 0.5rem 0;
								background: #f8f9fa;
								border-radius: 4px;
								text-decoration: none;
								color: #0070f3;
								transition: all 0.2s;
							}
							.snapshot-link:hover {
								background: #e9ecef;
								transform: translateX(4px);
							}
							header {
								margin-bottom: 2rem;
							}
							.home-link {
								color: #0070f3;
								text-decoration: none;
								margin-bottom: 1rem;
								display: inline-block;
								transition: transform 0.2s;
							}
							.home-link:hover {
								transform: translateX(-4px);
							}
							.count {
								background: #e9ecef;
								padding: 0.5rem 1rem;
								border-radius: 4px;
								margin: 1rem 0;
							}
						</style>
					</head>
					<body>
						<header>
							<a href="/" class="home-link">← Back to Home</a>
							<h1>Archives for ${domain}</h1>
							<div class="count">
								<p>${dates.length} snapshots available</p>
							</div>
						</header>

						<ul class="snapshots">
							${datesList}
						</ul>
					</body>
				</html>
			`)
		}
	} catch (error) {
		return c.json({ error: 'Failed to list archives' }, 500)
	}
})

app.post('/archive', async (c) => {
	const { url, archiveKey } = await c.req.json<{
		url: string
		archiveKey: string
	}>()

	if (archiveKey !== c.env.ARCHIVER_KEY) {
		return c.json({ error: 'Invalid archive key' }, 403)
	}

	try {
		const archiver = getArchiver(c)
		const previewUrl = await archiver.archiveUrl(url)

		return c.json({
			success: true,
			message: 'Page archived successfully',
			url,
			previewUrl
		})
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error'
		return c.json(
			{
				error: 'Failed to archive page',
				message: errorMessage
			},
			500
		)
	}
})

app.get('/:domain/:date/*', async (c) => {
	try {
		const domain = c.req.param('domain')
		const date = c.req.param('date')
		const remainingPath =
			c.req.path.split(`/${domain}/${date}/`)[1] || 'index.html'

		const storageKey = `${domain}/${date}/${remainingPath}`
		console.log('Fetching:', storageKey)

		const object = await c.env.ARCHIVE_BUCKET.get(storageKey)

		if (!object) {
			console.error('Object not found:', storageKey)
			return c.json({ error: 'Archive not found', path: storageKey }, 404)
		}

		const headers = new Headers()
		object.writeHttpMetadata(headers)
		headers.set('etag', object.httpEtag)
		headers.set('Content-Type', getContentType(remainingPath))
		headers.set('Cache-Control', 'public, max-age=31536000')

		const headerRecord: Record<string, string> = {}
		headers.forEach((value, key) => {
			headerRecord[key] = value
		})

		return c.body(await object.arrayBuffer(), 200, headerRecord)
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error occurred'
		return c.json(
			{
				error: 'Failed to retrieve archive',
				message: errorMessage,
				stack: error instanceof Error ? error.stack : undefined
			},
			500
		)
	}
})

export default app
