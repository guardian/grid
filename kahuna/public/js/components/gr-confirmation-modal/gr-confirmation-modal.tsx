import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import "./gr-confirmation-modal.css";
import {useEffect, useState, useRef} from "react";


const crossIcon = () =>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" fill="none" stroke="none"/>
    <path d="M7 17L16.8995 7.10051" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
    <path d="M7 7.00001L16.8995 16.8995" stroke="#000" strokeLinecap="round" strokeLinejoin="round"
          strokeWidth="2"/>
  </svg>;

const confirmationModal: React.FC = () => {

  const modalRef = useRef(null);
  const firstInputRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [showSingleBtn, setShowSingleBtn] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [cancelBtnTxt, setCancelBtnTxt] = useState("");
  const [confirmBtnTxt, setConfirmBtnTxt] = useState("");
  const [okayFunction, setOkayFunction] = useState(() => () => {return;});

  const onOkay = () => {
    document.body.removeAttribute("aria-hidden");
    setIsOpen(false);
    setShowSingleBtn(false);
    okayFunction();
  };

  const onCancel = () => {
    document.body.removeAttribute("aria-hidden");
    setShowSingleBtn(false);
    setIsOpen(false);
  };

  const handleDisplay = (e: any) => {
    document.body.setAttribute("aria-hidden", "true");
    setOkayFunction(() => e.detail.okayFn);
    setTitle(e.detail.title);
    setMessage(e.detail.message);
    setCancelBtnTxt(e.detail.cancelBtnTxt);
    setConfirmBtnTxt(e.detail.confirmBtnTxt);
    e.detail.showSingleBtn ? setShowSingleBtn(true) : showSingleBtn;
    setIsOpen(true);
  };

  const processedMessage = message.includes(';') ? message.split(';')
    .map((item, index) => <p key={index} className="styledParagraph">{item.trim()}</p>) : message;

  const processedMessage = message.includes(';') ? message.split(';')
    .map((item, index) => <p key={index} className="styledParagraph">{item.trim()}</p>) : message;

  useEffect(() => {
    window.addEventListener('displayModal', handleDisplay);
    return () => {
      document.body.removeAttribute("aria-hidden");
      window.removeEventListener('displayModal', handleDisplay);
    };
  },[]);

  useEffect(() => {
    const handleKeyDown = (e: any) => {
      if ((e.target.className === 'closeButtonStyle' || e.target.className === 'confirmButtonStyle') && (e.keyCode === 32 || e.keyCode === 13)) {
        e.preventDefault();  // Prevent the default action to avoid scrolling when using Space
        e.target.click();   // Trigger the button's onClick event
      }
      if (e.keyCode === 27) {
        onCancel();  // Close on ESC
      }
    };
    const trapTabKey = (e: any) => {
      if (e.keyCode !== 9) {return;} // Listen for TAB key only
      if (!modalRef.current) {return;}
      // Collect focusable items inside the modal
      const focusableModalElements = modalRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableModalElements[0];
      const lastElement = focusableModalElements[focusableModalElements.length - 1];
      // Trap focus inside modal
      if (e.shiftKey) { // if SHIFT + TAB
        if (document.activeElement === firstElement) { // loop focus back to last
          lastElement.focus();
          e.preventDefault();
        }
      } else { // if TAB
        if (document.activeElement === lastElement) { // loop focus back to first
          firstElement.focus();
          e.preventDefault();
        }
      }
    };
    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', trapTabKey);
    // Set initial focus to the first input inside the modal
    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
    // Remove event listeners on cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', trapTabKey);
    };
  }, [isOpen]);

  return (
    <div>
      {isOpen && (
        <div aria-label={title} ref={modalRef}>
          <div className='backdropStyle'/>
          <div className='modalStyle'>
            <div className='modalTitle'>{title}</div>
            <div className='modalMessage'>{processedMessage}</div>
            <div className="closeIconStyle" aria-label={"Close"} onClick={() => {onCancel();}}>
              {crossIcon()}
            </div>
              <div className="buttonContainerStyle">
                {!showSingleBtn && (
                  <div ref={firstInputRef} className='closeButtonStyle' aria-label={"Close"} tabIndex={0} onClick={() => {onCancel();}}>
                    {cancelBtnTxt}
                  </div>
                )}
                <div className='confirmButtonStyle' aria-label={"Confirm"} tabIndex={0} onClick={() => {onOkay();}}>
                  {confirmBtnTxt}
                </div>
              </div>
          </div>
        </div>)}
    </div>
  );
};

export const ConfirmationModal = angular.module('gr.confirmationModal', [])
  .component('confirmationModal', react2angular(confirmationModal));
