import { render, screen } from '@testing-library/react'
import { Avatar, colorOf, initialsOf } from './Avatar'

describe('Avatar', () => {
  it('iniciales del correo', () => {
    expect(initialsOf('ana.perez@x.com')).toBe('AP')
    expect(initialsOf('beto@x.com')).toBe('B')
    expect(initialsOf('carla_ruiz-lopez@x.com')).toBe('CR')
  })

  it('con alias, las iniciales salen del nombre; el color sigue siendo el del correo', () => {
    expect(initialsOf('Jorge Menéndez')).toBe('JM')
    expect(initialsOf('Ana')).toBe('A')
    render(<Avatar email="jorge@mercabits.com" alias="Jorge Menéndez" />)
    const img = screen.getByRole('img', { name: 'Jorge Menéndez' })
    expect(img).toHaveTextContent('JM')
  })

  it('el mismo correo da siempre el mismo color', () => {
    expect(colorOf('ana@x.com')).toBe(colorOf('ANA@x.com'))
  })

  it('expone el correo como nombre accesible, o se oculta si es decorativo', () => {
    const { rerender } = render(<Avatar email="ana@x.com" />)
    expect(screen.getByRole('img', { name: 'ana@x.com' })).toHaveTextContent('A')
    rerender(<Avatar email="ana@x.com" decorative />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})
