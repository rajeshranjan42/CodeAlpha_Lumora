import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from './Icons.jsx';

/** A password box with an eye button that shows / hides what you typed. */
export default function PasswordInput({ className = '', ...props }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} className={className} type={show ? 'text' : 'password'} />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        tabIndex={0}
      >
        {show ? <EyeOffIcon width={20} height={20} /> : <EyeIcon width={20} height={20} />}
      </button>
    </span>
  );
}