/**
 * 火火 — 宫格图切分（sharp extract → static/grid-cells）
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { getAbsolutePath } from '../../common/media/storage.js'

const CELL_OUTPUT_DIR = getAbsolutePath('grid-cells')
const CELL_URL_PREFIX = 'static/grid-cells/'

export interface GridCellAsset {
  index: number
  localPath: string
}

function resolveSourceAbs(relOrAbs: string): string {
  return relOrAbs.startsWith('/') ? relOrAbs : getAbsolutePath(relOrAbs)
}

/** 将宫格母图切成 row×col 块，返回各块静态路径 */
export async function extractGridTiles(
  sourceRelPath: string,
  rowCount: number,
  colCount: number,
): Promise<GridCellAsset[]> {
  const absSource = resolveSourceAbs(sourceRelPath)
  const meta = await sharp(absSource).metadata()
  if (!meta.width || !meta.height) throw new Error('Error, cannot read img dimensions ')

  const cellW = Math.floor(meta.width / colCount)
  const cellH = Math.floor(meta.height / rowCount)
  fs.mkdirSync(CELL_OUTPUT_DIR, { recursive: true })

  const runStamp = Date.now()
  const totalCells = rowCount * colCount
  const outputs: GridCellAsset[] = []

  for (let cellIdx = 0; cellIdx < totalCells; cellIdx++) {
    const rowIdx = Math.floor(cellIdx / colCount)
    const colIdx = cellIdx % colCount
    const fileName = `tile_${runStamp}_${cellIdx}.png`
    const absOut = path.join(CELL_OUTPUT_DIR, fileName)

    await sharp(absSource)
      .extract({
        left: colIdx * cellW,
        top: rowIdx * cellH,
        width: cellW,
        height: cellH,
      })
      .toFile(absOut)

    outputs.push({ index: cellIdx, localPath: `${CELL_URL_PREFIX}${fileName}` })
  }

  return outputs
}
