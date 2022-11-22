import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";

import styles from "./gr-feature-switch-panel.module.css";

type KeydownHandler = (e: KeyboardEvent) => void

type FeatureSwitchData = {
  key: string,
  title: string,
  value: 'true' | 'false'
 }

declare global {
  interface Window {
    _clientConfig: {
      featureSwitches: Array<FeatureSwitchData>
    }
  }
}

export const getFeatureSwitchActive = (key: string): boolean => {
  const match = document.cookie.match(new RegExp("(^| )" + "feature-switch-" + key + "=([^;]+)"));
  if (match) {
    return match[2] === "true";
  }
  return false;
};

const CloseIcon = () =>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <path d="m12.45 37.65-2.1-2.1L21.9 24 10.35 12.45l2.1-2.1L24 21.9l11.55-11.55 2.1 2.1L26.1 24l11.55 11.55-2.1 2.1L24 26.1Z"/>
  </svg>;

const InfoIcon = ({className} : {className: string}) =>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={className}>
    <path d="M22.35 34.3h3.6V22h-3.6ZM24 18.7q.9 0 1.475-.575.575-.575.575-1.425 0-.95-.575-1.525T24 14.6q-.9 0-1.475.575-.575.575-.575 1.525 0 .85.575 1.425.575.575 1.475.575Zm0 26q-4.3 0-8.05-1.625-3.75-1.625-6.575-4.45t-4.45-6.575Q3.3 28.3 3.3 24q0-4.35 1.625-8.1T9.35 9.35q2.8-2.8 6.575-4.45Q19.7 3.25 24 3.25q4.35 0 8.125 1.65 3.775 1.65 6.55 4.425t4.425 6.55Q44.75 19.65 44.75 24q0 4.3-1.65 8.075-1.65 3.775-4.45 6.575-2.8 2.8-6.55 4.425T24 44.7Zm.05-3.95q6.95 0 11.825-4.9 4.875-4.9 4.875-11.9 0-6.95-4.875-11.825Q31 7.25 24 7.25q-6.95 0-11.85 4.875Q7.25 17 7.25 24q0 6.95 4.9 11.85 4.9 4.9 11.9 4.9ZM24 24Z"/>
  </svg>;


const FeatureSwitch = ({ data }: { data: FeatureSwitchData}) => {
  const [on, setOn] = useState(data.value === "true");

  const handleClick = () => {
    const newOn = !on;
    document.cookie = `feature-switch-${data.key}=${newOn.toString()}`;
    setOn(newOn);
  };
  return (
    <tr>
      <td className="featureSwitch">{data.title}</td>
      <td className={styles['toggle']}>
        <button className={`${styles[getFeatureSwitchActive('example-switch') ? 'toggleButtonAlt' : 'toggleButton']} ${on ? styles['toggleButtonActive'] : ''}`} onClick={() => handleClick()}>
          On
        </button>
        <button className={`${styles[getFeatureSwitchActive('example-switch') ? 'toggleButtonAlt' : 'toggleButton']} ${!on ? styles['toggleButtonActive'] : ''}`} onClick={() => handleClick()}>
          Off
        </button>
      </td>
    </tr>
  );
};

const FeatureSwitchPanel = () => {
    const [visible, setVisible] = useState(false);
    const [panelStyles, setPanelStyles] = useState({
      visibility: "hidden" as "visible" | "hidden"
    });

    const featureSwitchData = window._clientConfig.featureSwitches;

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
            <div className={styles['infoPane']}>
              <InfoIcon className={styles['infoIcon']} />
              <span className={styles['instructions']}>
                Some settings will only be applied on page refresh
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {featureSwitchData.map(featureSwitch =>
                  <FeatureSwitch data={featureSwitch} key={featureSwitch.key}></FeatureSwitch>
                )}
              </tbody>
            </table>
          </div>
        </div>
    );
};

export const featureSwitchPanel = angular.module('gr.featureSwitchPanel', [])
  .component('featureSwitchPanel', react2angular(FeatureSwitchPanel));

