import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDemoSession, getRoleHomePath, getRoleLabel } from '../domain/access';
import type { Role } from '../domain/models';
import { useStore } from '../store/StoreProvider';
import { Brand } from './Brand';

const roleOptions: Role[] = ['PICKER', 'RECEIVER', 'MANAGER', 'ADMIN'];

export function LoginPage() {
  const navigate = useNavigate();
  const { state, login } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('MANAGER');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = createDemoSession(state.users, role, username);
    login(user);
    navigate(getRoleHomePath(role), { replace: true });
  }

  return (
    <main className="login-screen">
      <section aria-labelledby="login-heading" className="login-card">
        <Brand />
        <div className="login-heading-block">
          <p className="eyebrow">WAREHOUSE OPERATIONS</p>
          <h1 id="login-heading">Welcome back</h1>
          <p className="login-subtitle">Sign in to your workspace</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Username</span>
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter any username"
              type="text"
              value={username}
            />
          </label>
          <label className="form-field">
            <span>Password</span>
            <span className="password-control">
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter any password"
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <label className="form-field">
            <span>Demo role</span>
            <select onChange={(event) => setRole(event.target.value as Role)} value={role}>
              {roleOptions.map((option) => <option key={option} value={option}>{getRoleLabel(option)}</option>)}
            </select>
          </label>
          <button className="primary-button login-submit" type="submit">Sign In</button>
        </form>
        <p className="demo-access-note">Demo Access: use any credentials to continue</p>
        <p className="login-footnote">Your selected role controls the menus shown in this demo.</p>
      </section>
    </main>
  );
}
