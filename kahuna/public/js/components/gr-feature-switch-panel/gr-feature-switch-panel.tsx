import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";

import styles from "./gr-feature-switch-panel.module.css";

type KeydownHandler = (e: KeyboardEvent) => void

const CloseIcon = () =>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"height="18" width="18">
    <path d="m12.45 37.65-2.1-2.1L21.9 24 10.35 12.45l2.1-2.1L24 21.9l11.55-11.55 2.1 2.1L26.1 24l11.55 11.55-2.1 2.1L24 26.1Z"/>
  </svg>;

const FeatureSwitchPanel: React.FC = () => {
    const [visible, setVisible] = useState(false);
    const [panelStyles, setPanelStyles] = useState({
      visibility: "hidden" as "visible" | "hidden"
    });

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
      setPanelStyles({
        visibility: visible ? "visible" : "hidden"
      });
    }, [visible]);

    return (
        <div style={panelStyles}>
          <div className={`gr-panel__content ${styles['panel']}`}>
            <header>
              <span className={`image-info__heading ${styles['panelTitle']}`}>
                Feature Switches
              </span>
              <button
                onClick={(e) => setVisible(false)}
                className={styles['closeButton']}
              >
                <CloseIcon />
              </button>
            </header>
          </div>
        </div>
    );
};

export const featureSwitchPanel = angular.module('gr.featureSwitchPanel', [])
  .component('featureSwitchPanel', react2angular(FeatureSwitchPanel));

