import {
  ageOn,
  indexCanonicalPlayers,
  matchByAge,
  matchByBirthDate,
  validBirthDate,
} from '../../src/shared/playerMatching'

const sleeper = indexCanonicalPlayers([
  { id: 1, name: 'Fixture Receiver', position: 'WR', birthDate: '2000-05-10' },
  // Two different people with one name: only the birth date tells them apart.
  { id: 2, name: 'Common Name', position: 'WR', birthDate: '1998-01-01' },
  { id: 3, name: 'Common Name', position: 'WR', birthDate: '2002-09-30' },
  { id: 4, name: 'Undated Back', position: 'RB', birthDate: null },
  { id: 5, name: 'Suffix Runner Jr.', position: 'RB', birthDate: '2001-03-03' },
  { id: 6, name: 'Place Kicker', position: 'K', birthDate: '1995-02-02' },
])

test('Dynasty GM links only when name, position, and birth date agree on one Sleeper player', () => {
  expect(
    matchByBirthDate(
      { name: 'Fixture Receiver', position: 'WR', birthDate: '2000-05-10' },
      sleeper,
    ),
  ).toEqual({ status: 'linked', playerId: 1, note: 'Name, position, and birth date agree.' })
  expect(
    matchByBirthDate({ name: 'Common Name', position: 'WR', birthDate: '2002-09-30' }, sleeper),
  ).toMatchObject({ status: 'linked', playerId: 3 })
  expect(
    matchByBirthDate({ name: 'Suffix Runner', position: 'RB', birthDate: '2001-03-03' }, sleeper),
  ).toMatchObject({ status: 'linked', playerId: 5 })
})

test('a name match without agreeing birth dates waits for review instead of guessing', () => {
  expect(
    matchByBirthDate(
      { name: 'Fixture Receiver', position: 'WR', birthDate: '2000-05-11' },
      sleeper,
    ),
  ).toEqual({
    status: 'ambiguous',
    note: 'A Sleeper player matches by name, but the birth date differs.',
  })
  for (const birthDate of [null, '', 'NaN-NaN-NaN'])
    expect(
      matchByBirthDate({ name: 'Common Name', position: 'WR', birthDate }, sleeper),
    ).toMatchObject({
      status: 'ambiguous',
      note: expect.stringContaining('no birth date to confirm'),
    })
  expect(
    matchByBirthDate({ name: 'Undated Back', position: 'RB', birthDate: '1999-09-09' }, sleeper),
  ).toMatchObject({
    status: 'ambiguous',
    note: expect.stringContaining('Sleeper has no birth date'),
  })
  expect(
    matchByBirthDate({ name: 'Nobody Here', position: 'TE', birthDate: '1999-09-09' }, sleeper),
  ).toMatchObject({ status: 'unmatched' })
  // Position is part of identity, and only skill positions are matched.
  expect(
    matchByBirthDate(
      { name: 'Fixture Receiver', position: 'TE', birthDate: '2000-05-10' },
      sleeper,
    ),
  ).toMatchObject({ status: 'unmatched' })
  expect(
    matchByBirthDate({ name: 'Place Kicker', position: 'K', birthDate: '1995-02-02' }, sleeper),
  ).toMatchObject({ status: 'skipped' })
})

test('DTC links by age within tolerance of the Sleeper birth date', () => {
  const observedAt = new Date('2026-09-13T12:00:00Z')
  const age = Math.round(ageOn('2002-09-30', observedAt) * 10) / 10
  expect(
    matchByAge({ name: 'Common Name', position: 'WR', age, observedAt }, sleeper),
  ).toMatchObject({ status: 'linked', playerId: 3 })
  expect(
    matchByAge({ name: 'Common Name', position: 'WR', age: age + 0.3, observedAt }, sleeper),
  ).toMatchObject({ status: 'ambiguous', note: expect.stringContaining('age differs') })
  expect(
    matchByAge({ name: 'Common Name', position: 'WR', age: null, observedAt }, sleeper),
  ).toMatchObject({ status: 'ambiguous', note: expect.stringContaining('no age to confirm') })
})

test('birth dates must be real calendar dates in YYYY-MM-DD form', () => {
  expect(validBirthDate('2000-05-10')).toBe('2000-05-10')
  for (const value of ['2000-5-10', '10/05/2000', 'NaN-NaN-NaN', '', null, 20000510])
    expect(validBirthDate(value)).toBeNull()
})
