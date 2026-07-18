import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const boundaryEditorComponent = new URL('../components/admin/BoundaryEditor.tsx', import.meta.url)

test('settlement changes invalidate POI operations and release busy state', async () => {
  const editor = await readFile(boundaryEditorComponent, 'utf8')
  const coordinateUpdate = editor.slice(
    editor.indexOf('const handlePoiCoordinateUpdate'),
    editor.indexOf('\n  useEffect(() => {', editor.indexOf('const handlePoiCoordinateUpdate')),
  )
  const save = editor.slice(editor.indexOf('const handlePoiSave'), editor.indexOf('const handlePoiDelete'))
  const deletion = editor.slice(editor.indexOf('const handlePoiDelete'), editor.indexOf('const handleMapSurfaceClick'))

  assert.match(editor, /operationGenerationRef = useRef\(0\)/)
  assert.match(editor, /operationGenerationRef\.current \+= 1/)
  assert.match(editor, /const beginPoiOperation = useCallback/)
  assert.match(editor, /const isCurrentPoiOperation = useCallback/)
  assert.match(editor, /setBusy\(false\)/)
  for (const operation of [coordinateUpdate, save, deletion]) {
    assert.match(operation, /beginPoiOperation\(\)/)
    assert.match(operation, /isCurrentPoiOperation\(operation\)/)
    assert.match(operation, /finishPoiOperation\(operation\)/)
  }
})

test('settlement changes reset every boundary draft value and ref', async () => {
  const editor = await readFile(boundaryEditorComponent, 'utf8')

  assert.match(editor, /setDraftMode\(nextDraftMode\)/)
  assert.match(editor, /setPoints\(\[\]\)[\s\S]*pointsRef\.current = \[\]/)
  assert.match(editor, /setCenter\(null\)[\s\S]*centerRef\.current = null/)
  assert.match(editor, /setRadiusM\(nextRadius\)[\s\S]*radiusRef\.current = nextRadius/)
  assert.match(editor, /setDraftGeometry\(settlement\.geometry \|\| null\)/)
  assert.match(editor, /setPreview\(null\)/)
  assert.match(editor, /setMode\(null\)[\s\S]*modeRef\.current = null/)
  assert.match(editor, /setMessage\(''\)[\s\S]*setError\(''\)/)
  assert.match(editor, /setMapReady\(false\)/)
})

test('drag persistence preserves unsaved POI form fields and restores failed coordinates', async () => {
  const editor = await readFile(boundaryEditorComponent, 'utf8')
  const start = editor.indexOf('const handlePoiCoordinateUpdate')
  const end = editor.indexOf('\n  useEffect(() => {', start)
  const handler = editor.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(handler, /\.\.\.current,[\s\S]*longitude: result\.longitude,[\s\S]*latitude: result\.latitude/)
  assert.doesNotMatch(handler, /poiDraftFrom\(result\)/)
  assert.match(handler, /marker\.setLngLat\(previousCoordinates\)/)
})

test('new POI draft is represented by a draggable map marker', async () => {
  const editor = await readFile(boundaryEditorComponent, 'utf8')

  assert.match(editor, /if \(poiDraft && !poiDraft\.id\)/)
  assert.match(editor, /draftMarker[\s\S]*draggable: true/)
  assert.match(editor, /setPoiDraft\(\(current\) => current && !current\.id/)
})
