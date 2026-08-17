/**
 * Guard: every user-facing string must exist in BOTH en{} and fr{}. A missing
 * key silently renders English (or the raw key) in the other language — this
 * test fails the moment the two dictionaries drift out of sync. Run: npm test
 */
import { describe, it, expect } from 'vitest'
import { TRANSLATIONS } from './LanguageContext'

describe('i18n key parity', () => {
  it('en and fr expose identical key sets', () => {
    const en = Object.keys(TRANSLATIONS.en).sort()
    const fr = Object.keys(TRANSLATIONS.fr).sort()
    expect(en.filter(k => !(k in TRANSLATIONS.fr))).toEqual([]) // missing in fr
    expect(fr.filter(k => !(k in TRANSLATIONS.en))).toEqual([]) // missing in en
    expect(en).toEqual(fr)
  })
})
