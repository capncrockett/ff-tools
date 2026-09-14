import {
  ageOn,
  indexCanonicalPlayers,
  leaguePosition,
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
  // Position is part of identity, and draft picks are never matched to players.
  expect(
    matchByBirthDate(
      { name: 'Fixture Receiver', position: 'TE', birthDate: '2000-05-10' },
      sleeper,
    ),
  ).toMatchObject({ status: 'unmatched' })
  expect(
    matchByBirthDate({ name: '2027 Round 1', position: 'pick', birthDate: null }, sleeper),
  ).toEqual({
    status: 'skipped',
    note: 'Picks are tracked separately from players.',
  })
})

test('the league positions are QB, RB, WR, and TE, by listed position or fantasy eligibility', () => {
  expect(leaguePosition('WR')).toBe('WR')
  expect(leaguePosition('FB', ['RB'])).toBe('RB')
  for (const [position, eligible] of [
    ['K', ['K']],
    ['DEF', []],
    ['OL', undefined],
    [null, ['DB']],
  ])
    expect(leaguePosition(position, eligible)).toBeNull()
})

test('DTC links by its whole-year age, allowing a few weeks for a birthday it has not caught up to', () => {
  const observedAt = new Date('2026-09-13T12:00:00Z')
  // DTC shows completed years: 23.96 years old reads "23Y", and 28.7 reads "28Y".
  expect(ageOn('2002-09-30', observedAt)).toBeCloseTo(23.96, 2)
  const dtc = (name: string, position: string, age: number | null) =>
    matchByAge({ name, position, age, observedAt }, sleeper)
  expect(dtc('Common Name', 'WR', 23)).toMatchObject({ status: 'linked', playerId: 3 })
  expect(dtc('Common Name', 'WR', 28)).toMatchObject({ status: 'linked', playerId: 2 })
  // A number the exact age has not reached, or passed more than a year ago, confirms no one.
  for (const age of [24, 26])
    expect(dtc('Common Name', 'WR', age)).toMatchObject({
      status: 'ambiguous',
      note: expect.stringContaining('age differs'),
    })
  expect(dtc('Common Name', 'WR', null)).toMatchObject({
    status: 'ambiguous',
    note: expect.stringContaining('no age to confirm'),
  })
  // Twelve days past a birthday, DTC may still show the previous year.
  const birthday = indexCanonicalPlayers([
    { id: 9, name: 'Birthday Back', position: 'RB', birthDate: '2000-09-01' },
  ])
  expect(
    matchByAge({ name: 'Birthday Back', position: 'RB', age: 25, observedAt }, birthday),
  ).toMatchObject({ status: 'linked', playerId: 9 })
  expect(
    matchByAge({ name: 'Birthday Back', position: 'RB', age: 24, observedAt }, birthday),
  ).toMatchObject({ status: 'ambiguous' })
})

test('birth dates must be real calendar dates in YYYY-MM-DD form', () => {
  expect(validBirthDate('2000-05-10')).toBe('2000-05-10')
  expect(validBirthDate('2000-02-29')).toBe('2000-02-29')
  for (const value of [
    '2000-5-10',
    '10/05/2000',
    '2001-02-29',
    '2000-02-30',
    'NaN-NaN-NaN',
    '',
    null,
    20000510,
  ])
    expect(validBirthDate(value)).toBeNull()
})
