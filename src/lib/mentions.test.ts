import {
  decodeMentions,
  encodeMentions,
  filterPeople,
  mentionQuery,
  mentionedIds,
  splitMentions,
} from './mentions'

const people = [
  { userId: 'u1', name: 'Jorge Menéndez' },
  { userId: 'u2', name: 'Jorge' },
  { userId: 'u3', name: 'ana@correo.com' },
]

describe('menciones', () => {
  it('codifica @Nombre como enlace, prefiriendo el nombre más largo', () => {
    expect(encodeMentions('hola @Jorge Menéndez, revisa', people)).toBe(
      'hola [@Jorge Menéndez](mention:u1), revisa',
    )
    expect(encodeMentions('@Jorge mira', people)).toBe('[@Jorge](mention:u2) mira')
  })

  it('no confunde correos ni nombres a medias', () => {
    expect(encodeMentions('escribe a x@Jorge.com', people)).toBe('escribe a x@Jorge.com')
    expect(encodeMentions('@Jorgeluis no es Jorge', people)).toBe('@Jorgeluis no es Jorge')
    expect(encodeMentions('@ana@correo.com ok', people)).toBe('[@ana@correo.com](mention:u3) ok')
  })

  it('decodifica con el nombre actual (sigue al usuario si cambia de alias)', () => {
    const text = 'hola [@Jorge M.](mention:u1) y [@fuera](mention:zz)'
    expect(decodeMentions(text, people)).toBe('hola @Jorge Menéndez y @fuera')
  })

  it('codificar y decodificar es reversible', () => {
    const plain = 'cc @Jorge Menéndez y @ana@correo.com'
    expect(decodeMentions(encodeMentions(plain, people), people)).toBe(plain)
  })

  it('lista los ids mencionados y parte el texto en trozos', () => {
    const t = 'a [@Jorge](mention:u2) b [@Ana](mention:u3)'
    expect(mentionedIds(t)).toEqual(['u2', 'u3'])
    expect(splitMentions(t)).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'mention', id: 'u2', label: 'Jorge' },
      { type: 'text', text: ' b ' },
      { type: 'mention', id: 'u3', label: 'Ana' },
    ])
  })

  it('detecta la consulta @ antes del cursor', () => {
    expect(mentionQuery('hola @jo')).toEqual({ query: 'jo', start: 5 })
    expect(mentionQuery('@')).toEqual({ query: '', start: 0 })
    expect(mentionQuery('correo x@jo')).toBeNull()
    expect(mentionQuery('hola @jo ya')).toBeNull()
  })

  it('filtra sin acentos ni mayúsculas', () => {
    expect(filterPeople(people, 'menen').map((p) => p.userId)).toEqual(['u1'])
    expect(filterPeople(people, '').length).toBe(3)
  })
})
