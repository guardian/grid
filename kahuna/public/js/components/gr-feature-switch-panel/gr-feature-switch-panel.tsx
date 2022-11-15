import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";

import styles from "./gr-feature-switch-panel.module.css";
const initialStyles = {
  // backgroundColor: "grey",
  // border: "1px solid black",
  padding: "10px",
  position: "fixed" as const,
  top: "50px",
  right: "0px",
  visibility: "hidden" as "hidden" | "visible"
};

const closeIconStyles = {
  fill: "rgb(204,204,204)"
};

type KeydownHandler = (e: KeyboardEvent) => void

const CloseIcon = () =>
  <svg style={closeIconStyles} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"height="18" width="18">
    <path d="m12.45 37.65-2.1-2.1L21.9 24 10.35 12.45l2.1-2.1L24 21.9l11.55-11.55 2.1 2.1L26.1 24l11.55 11.55-2.1 2.1L24 26.1Z"/>
  </svg>;

const FeatureSwitchPanel: React.FC = () => {
    const [visible, setVisible] = useState(false);
    const [styles, setStyles] = useState(initialStyles);

    const useEventListener = (eventName: string, handler: (e: KeyboardEvent) => void, element = window) => {
      const savedHandler = useRef<KeydownHandler>();

      useEffect(() => {
        savedHandler.current = handler;
      }, [handler]);

      useEffect(
        () => {
          const isSupported = element && element.addEventListener;
          if (!isSupported) {return;}

          const eventListener = (event: KeyboardEvent) => savedHandler.current(event);
          element.addEventListener(eventName, eventListener);
            return () => {
            element.removeEventListener(eventName, eventListener);
          };
        },
        [eventName, element]
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey  &&  event.code === "F11") {
        setVisible(!visible);
      }
    };

    useEventListener('keydown', handleKeyDown);

    useEffect(() => {
      setStyles({
        ...styles,
        visibility: visible ? "visible" : "hidden"
      });
    }, [visible]);

    return (
        <div style={styles} className="gr-panel__content">
          Feature Switches
          <CloseIcon/>
        </div>
    );
};

export const featureSwitchPanel = angular.module('gr.featureSwitchPanel', [])
  .component('featureSwitchPanel', react2angular(FeatureSwitchPanel));

