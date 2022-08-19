// eslint-disable-next-line no-unused-vars
import React from "react";
import {renderQuery, structureQuery} from "../structured-query/syntax";

// FIXME change to typescript

const checkboxClauses = {
  "Has Crops": {
    type: "filter",
    filterType: "inclusion",
    key: "has",
    value: "crops"
  },
  "GNM Owned": {
    type: "filter",
    filterType: "inclusion",
    key: "is",
    value: "GNM-owned"
  },
  "Deleted": {
    type: "filter",
    filterType: "inclusion",
    key: "is",
    value: "deleted"
  }
};

const checkboxClausesWithPredicates = Object.entries(checkboxClauses).map(([label, instance]) => ({
  label,
  instance,
  predicate: (_) =>
    _.type === instance.type &&
    _.filterType === instance.filterType &&
    _.key === instance.key &&
    _.value === instance.value
}));

const not = (predicate) => (_) => !predicate(_);

export const AlternateFiltersPanel = ({filter, updateFilter}) => {
  const structuredQuery = filter?.query && structureQuery(filter.query) || [];
  return (
    <div style={{
      userSelect: "none",
      padding: "5px",
      borderBottom: "1px solid #565656"
    }}>
      ⚛️
      {checkboxClausesWithPredicates.map(clause => (
        <label key={clause.label}>
          <input type="checkbox"
                 checked={!!structuredQuery?.find(clause.predicate)}
                 onChange={e => {
                   const isChecked = e.target.checked;
                   const newStructuredQuery = isChecked
                     ? [...structuredQuery, clause.instance]
                     : structuredQuery.filter(not(clause.predicate));
                   updateFilter({...filter, query: renderQuery(newStructuredQuery)});
                 }}
          />
          {clause.label}
        </label>
      ))}
    </div>
  );
};
