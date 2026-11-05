import { getConfig, isConfigured } from './config'

describe('config', () => {
  afterEach(() => {
    delete window.__CONFIG__
  })

  it('lee window.__CONFIG__ y quita la barra final', () => {
    window.__CONFIG__ = { API_URL: '/api/' }
    expect(getConfig()).toEqual({ API_URL: '/api' })
    expect(isConfigured()).toBe(true)
  })

  it('sin config: modo solo local', () => {
    expect(getConfig()).toEqual({ API_URL: '' })
    expect(isConfigured()).toBe(false)
  })
})
