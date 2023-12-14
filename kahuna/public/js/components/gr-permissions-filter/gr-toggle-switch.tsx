import * as React from "react";
import "./gr-toggle-switch.css";

interface ToggleSwitchProps {
  label: string;
  chargeable: boolean;
  chargeableChange: () => void;
}

const ToggleSwitch:React.FC<ToggleSwitchProps> = (props) => {
  const {label, chargeable, chargeableChange} = props
  const [isToggled, setIsToggled] = React.useState(chargeable);

  const handleToggle = () => {
    setIsToggled(prevState => !prevState);
    chargeableChange();
  };

  return (
    <div className="ts-toggle-container">
      <label className="ts-toggle-switch">
        <input type="checkbox" checked={isToggled} onChange={handleToggle} />
        <span className="ts-slider round"></span>
      </label>
      <div className="ts-toggle-label">{label}</div>
    </div>
  );
};

export default ToggleSwitch;
