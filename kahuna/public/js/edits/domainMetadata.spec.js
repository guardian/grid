import {
  domainMetadataElasticsearchPath,
  findDomainMetadataFieldAlias,
  getDistinctDomainMetadataValues,
  getNewDomainMetadataFieldValue,
  readDomainMetadataFieldValue,
  supportsEditOptions
} from './domainMetadata';

import { overwrite, prepend, append } from '../util/constants/editOptions';

const imageWith = (domainMetadata) => ({ data: { metadata: { domainMetadata } } });

const imageWithProgrammeTitle = (programmeTitle) =>
  imageWith({ programmes: { programmeTitle } });

describe('readDomainMetadataFieldValue', () => {
  it('reads a value held under the specification', () => {
    const image = imageWithProgrammeTitle('Newsnight');
    expect(readDomainMetadataFieldValue(image, 'programmes', 'programmeTitle')).toBe('Newsnight');
  });

  it('returns undefined when the image has no domain metadata at all', () => {
    expect(readDomainMetadataFieldValue(imageWith(undefined), 'programmes', 'programmeTitle'))
      .toBeUndefined();
  });

  it('returns undefined when the specification is absent', () => {
    expect(readDomainMetadataFieldValue(imageWith({}), 'programmes', 'programmeTitle'))
      .toBeUndefined();
  });

  it('returns undefined when the field is absent from the specification', () => {
    const image = imageWith({ programmes: { programmeNumber: '123' } });
    expect(readDomainMetadataFieldValue(image, 'programmes', 'programmeTitle')).toBeUndefined();
  });

  it('normalises null and empty string to undefined', () => {
    expect(readDomainMetadataFieldValue(imageWithProgrammeTitle(null), 'programmes', 'programmeTitle'))
      .toBeUndefined();
    expect(readDomainMetadataFieldValue(imageWithProgrammeTitle(''), 'programmes', 'programmeTitle'))
      .toBeUndefined();
  });

  it('preserves falsy values that are genuine values', () => {
    const image = imageWith({ programmes: { episodeTxWeek: 0 } });
    expect(readDomainMetadataFieldValue(image, 'programmes', 'episodeTxWeek')).toBe(0);
  });
});

describe('getDistinctDomainMetadataValues', () => {
  const distinct = (images) => getDistinctDomainMetadataValues(images, 'programmes', 'programmeTitle');

  it('returns a single value when every image agrees', () => {
    const images = [
      imageWithProgrammeTitle('Newsnight'),
      imageWithProgrammeTitle('Newsnight'),
      imageWithProgrammeTitle('Newsnight')
    ];
    expect(distinct(images)).toStrictEqual(['Newsnight']);
  });

  it('returns each distinct value when images differ', () => {
    const images = [
      imageWithProgrammeTitle('Newsnight'),
      imageWithProgrammeTitle('Panorama')
    ];
    expect(distinct(images)).toStrictEqual(['Newsnight', 'Panorama']);
  });

  // A missing value is a distinct state: a selection where only some images hold a
  // value must be reported as having multiple values, not as sharing that one value.
  it('treats a missing value as distinct from a held value', () => {
    const images = [
      imageWithProgrammeTitle('Newsnight'),
      imageWith({})
    ];
    expect(distinct(images)).toStrictEqual(['Newsnight', undefined]);
  });

  it('treats null and empty string as the same missing value as an absent field', () => {
    const images = [
      imageWithProgrammeTitle(null),
      imageWithProgrammeTitle(''),
      imageWith({}),
      imageWith(undefined)
    ];
    expect(distinct(images)).toStrictEqual([undefined]);
  });

  it('returns a single value for a single image', () => {
    expect(distinct([imageWithProgrammeTitle('Newsnight')])).toStrictEqual(['Newsnight']);
  });

  it('returns no values for an empty selection', () => {
    expect(distinct([])).toStrictEqual([]);
  });

  // The displayed count is the length of this list, so these cases pin down what
  // "n values" means in the info panel.
  describe('as the count shown in the info panel', () => {
    it('counts each differing value once', () => {
      const images = [
        imageWithProgrammeTitle('Newsnight'),
        imageWithProgrammeTitle('Panorama'),
        imageWithProgrammeTitle('Newsnight')
      ];
      expect(distinct(images)).toHaveLength(2);
    });

    // Images holding no value form one further distinct state, so a selection of
    // "Newsnight" plus two empties counts as 2, not 1.
    it('counts images holding no value as one further state', () => {
      const images = [
        imageWithProgrammeTitle('Newsnight'),
        imageWith({}),
        imageWith({})
      ];
      expect(distinct(images)).toHaveLength(2);
    });

    it('counts a uniform selection as one, so no count is shown', () => {
      const images = [
        imageWithProgrammeTitle('Newsnight'),
        imageWithProgrammeTitle('Newsnight')
      ];
      expect(distinct(images)).toHaveLength(1);
    });
  });

  it('does not conflate values from a different specification', () => {
    const images = [
      imageWith({ programmes: { programmeTitle: 'Newsnight' } }),
      imageWith({ other: { programmeTitle: 'Panorama' } })
    ];
    expect(distinct(images)).toStrictEqual(['Newsnight', undefined]);
  });
});

describe('findDomainMetadataFieldAlias', () => {
  const fieldAliases = [
    {
      elasticsearchPath: 'metadata.domainMetadata.programmes.inArchive',
      alias: 'archived'
    },
    {
      elasticsearchPath: 'metadata.domainMetadata.programmes.programmeTitle',
      alias: 'programmeTitle'
    }
  ];

  it('builds the elasticsearch path from the specification and field names', () => {
    expect(domainMetadataElasticsearchPath('programmes', 'programmeTitle'))
      .toBe('metadata.domainMetadata.programmes.programmeTitle');
  });

  it('resolves the alias for a configured field', () => {
    expect(findDomainMetadataFieldAlias(fieldAliases, 'programmes', 'programmeTitle'))
      .toBe('programmeTitle');
  });

  // The alias may be named differently to the field, so matching must be on the path.
  it('resolves an alias that is named differently to the field', () => {
    expect(findDomainMetadataFieldAlias(fieldAliases, 'programmes', 'inArchive'))
      .toBe('archived');
  });

  it('returns undefined for a field with no configured alias', () => {
    expect(findDomainMetadataFieldAlias(fieldAliases, 'programmes', 'programmeNumber'))
      .toBeUndefined();
  });

  it('does not match a field of the same name in another specification', () => {
    expect(findDomainMetadataFieldAlias(fieldAliases, 'other', 'programmeTitle'))
      .toBeUndefined();
  });

  it('returns undefined when no aliases are configured', () => {
    expect(findDomainMetadataFieldAlias(undefined, 'programmes', 'programmeTitle')).toBeUndefined();
    expect(findDomainMetadataFieldAlias([], 'programmes', 'programmeTitle')).toBeUndefined();
  });
});

describe('supportsEditOptions', () => {
  it('is true for a string field that opts in', () => {
    expect(supportsEditOptions({ fieldType: 'string', allowEditOptions: true })).toBe(true);
  });

  it('is false for a string field that has not opted in', () => {
    expect(supportsEditOptions({ fieldType: 'string' })).toBe(false);
    expect(supportsEditOptions({ fieldType: 'string', allowEditOptions: false })).toBe(false);
  });

  // The flag must never turn a non-text field into one that concatenates values.
  it('is false for non-string fields even when the flag is set', () => {
    ['datetime', 'integer', 'select'].forEach(fieldType => {
      expect(supportsEditOptions({ fieldType, allowEditOptions: true })).toBe(false);
    });
  });

  it('requires the flag to be a boolean true rather than merely truthy', () => {
    expect(supportsEditOptions({ fieldType: 'string', allowEditOptions: 'true' })).toBe(false);
  });
});

describe('getNewDomainMetadataFieldValue', () => {
  it('overwrites the current value', () => {
    expect(getNewDomainMetadataFieldValue('Newsnight', 'Panorama', overwrite.key)).toBe('Panorama');
  });

  it('adds the new value before the current value', () => {
    expect(getNewDomainMetadataFieldValue('Newsnight', 'BBC', prepend.key)).toBe('BBC Newsnight');
  });

  it('adds the new value after the current value', () => {
    expect(getNewDomainMetadataFieldValue('Newsnight', '2026', append.key)).toBe('Newsnight 2026');
  });

  // Without this an image holding no value would be saved as "BBC undefined".
  it('uses the new value alone when the image holds no value', () => {
    [undefined, null, ''].forEach(currentValue => {
      expect(getNewDomainMetadataFieldValue(currentValue, 'BBC', prepend.key)).toBe('BBC');
      expect(getNewDomainMetadataFieldValue(currentValue, 'BBC', append.key)).toBe('BBC');
      expect(getNewDomainMetadataFieldValue(currentValue, 'BBC', overwrite.key)).toBe('BBC');
    });
  });

  it('falls back to overwrite for an unrecognised or absent edit option', () => {
    expect(getNewDomainMetadataFieldValue('Newsnight', 'Panorama', undefined)).toBe('Panorama');
    expect(getNewDomainMetadataFieldValue('Newsnight', 'Panorama', 'nonsense')).toBe('Panorama');
  });
});
