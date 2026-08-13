import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './LoginPage.module.css';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await login(username, password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>📈</span>
          <h1 className={styles.logoText}>GapAnalyzer</h1>
        </div>
        <p className={styles.subtitle}>Ingresá con tus credenciales para continuar</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Usuario</label>
            <input
              id="login-username"
              type="text"
              className={styles.input}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="usuario"
              autoComplete="username"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Contraseña</label>
            <input
              id="login-password"
              type="password"
              className={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button id="login-submit" type="submit" className={styles.button} disabled={loading}>
            {loading ? <span className={styles.spinner} /> : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
};
