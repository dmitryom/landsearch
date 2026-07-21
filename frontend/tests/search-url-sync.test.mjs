import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('public search keeps URL and selected settlement visible in both search shells', async () => {
  const page = await read('app/page.tsx')

  assert.match(page, /const searchValue = filters\.query \|\| selectedSettlement\?\.name \|\| ''/)
  assert.equal((page.match(/<SearchBar[^>]*value=\{searchValue\}/g) || []).length, 2)
})
