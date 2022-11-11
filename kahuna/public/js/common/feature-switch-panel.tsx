import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";

// import styles from "./gr-description-warning.module.css";
const initialStyles = {
  // backgroundColor: "grey", 
  // border: "1px solid black", 
  padding: "10px", 
  position: "fixed" as "fixed",
  top: "50px",
  right: "0px",
  visibility: "hidden" as "hidden" | "visible",
}

type KeydownHandler = (e: KeyboardEvent) => void

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
          if (!isSupported) return;
    
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
        setVisible(!visible)
      }
    }

    useEventListener('keydown', handleKeyDown);

    useEffect(() => { 
      setStyles({
        ...styles,
        visibility: visible ? "visible" : "hidden"
      })
    }, [visible])

    return (
        <div style={styles} className="gr-panel__content">
          Feature Switches
        </div>
    );
}

export const featureSwitchPanel = angular.module('gr.featureSwitchPanel', [])
  .component('featureSwitchPanel', react2angular(FeatureSwitchPanel));

