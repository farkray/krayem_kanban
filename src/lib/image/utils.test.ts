import { fitWithin, formatBytes, savingLabel } from './utils'

describe('fitWithin', () => {
  it('no agranda', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
  it('reduce el lado largo a 1600 manteniendo proporción', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })
  it('nunca da 0', () => {
    expect(fitWithin(100_000, 10, 1600).height).toBe(1)
  })
})

describe('formatBytes / savingLabel', () => {
  it('formatea', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(380 * 1024)).toBe('380 KB')
    expect(formatBytes(4.2 * 1024 * 1024)).toBe('4,2 MB')
  })
  it('muestra el ahorro o solo el tamaño', () => {
    expect(savingLabel(4_000_000, 400_000)).toBe('3,8 MB → 390,6 KB (−90 %)')
    expect(savingLabel(1000, 1200)).toBe('1,2 KB')
  })
})
