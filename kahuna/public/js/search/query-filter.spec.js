// query-filter.js registers itself as an Angular module as a side effect of import
// (`angular.module(...)`), which needs a real DOM/angular runtime to succeed. Since
// fieldFilter/maybeQuoted are plain functions with no Angular dependency, stub out
// angular.module here so the module can be imported in isolation under Jest.
jest.mock('angular', () => {
  const chainableModule = {
    factory: () => chainableModule,
    filter: () => chainableModule
  };
  return { __esModule: true, default: { module: () => chainableModule } };
});

import { fieldFilter, maybeQuoted } from './query-filter';

describe('maybeQuoted', () => {
  it("leaves a value without reserved characters untouched", () => {
    expect(maybeQuoted('true')).toBe('true');
  });

  it("wraps a value containing whitespace in quotes", () => {
    expect(maybeQuoted('some value')).toBe('"some value"');
  });

  it("wraps a value containing a colon in quotes", () => {
    expect(maybeQuoted('a:b')).toBe('"a:b"');
  });
});

describe('fieldFilter', () => {
  it("builds a simple field:value filter for a plain string value", () => {
    expect(fieldFilter('credit', 'Getty Images')).toBe('credit:"Getty Images"');
  });

  it("quotes the field name too, if it contains reserved characters", () => {
    expect(fieldFilter('some field', 'value')).toBe('"some field":value');
  });

  it("strips double quotes already present in the value before re-quoting", () => {
    expect(fieldFilter('credit', '"Getty Images"')).toBe('credit:"Getty Images"');
  });

  it("builds a correct field:value filter when the value is a boolean, not a string", () => {
    expect(fieldFilter('c2paMetadataAvailable', true)).toBe('c2paMetadataAvailable:true');
    expect(fieldFilter('c2paMetadataAvailable', false)).toBe('c2paMetadataAvailable:false');
  });
});
