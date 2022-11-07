// eslint-disable-next-line no-unused-vars
import React, { useState } from 'react';

export const DateSort = (props) => {
  const [reactOrderState, setReactOrderState] = useState(props.initialOrder);

  const setOrder = (value) => {
    setReactOrderState(value);
    props.setNgOrder(value);
  };

  return (
    <div className="search__modifier order__option">
        <div className="search__modifier-item radio-list">
        <RadioOption
          radioLabel="Order search results by newest first"
          id="sort-direction__desc"
          labelText="Newest first"
          value={undefined}
          order={reactOrderState}
          setOrder={setOrder}
        />
        { props.collectionSearch ?
          <RadioOption
            radioLabel="Order search results by recently added first"
            id="added-to-collection"
            labelText="Recently Added First"
            value="dateAddedToCollection"
            order={reactOrderState}
            setOrder={setOrder}
          /> :
          <RadioOption
            radioLabel="Order search results by oldest first"
            id="sort-direction__asc"
            labelText="Oldest first"
            value="oldest"
            order={reactOrderState}
            setOrder={setOrder}
          />
        }
      </div>
    </div>
  );
};

// eslint-disable-next-line no-unused-vars
const RadioOption = (props) => {
  return (
    <div className="radio-list__item">
        <input
          type="radio"
          aria-hidden="false"
          id={props.id}
          className="radio-list__circle"
          name="sort-direction"
          aria-label={props.radioLabel}
        />
        <label
          htmlFor={props.id}
          className={`radio-list__label${props.value === props.order ? " radio-list--selected" : ""}`}
          onClick={() => {
            props.setOrder(props.value);
          }}
        >
            <div className="radio-list__selection-state"></div>
            <div className="radio-list__label-value">{props.labelText}</div>
        </label>
      </div>
  );
};
