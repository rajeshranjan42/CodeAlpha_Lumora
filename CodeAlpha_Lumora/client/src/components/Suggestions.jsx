import { useEffect, useState } from 'react';
import { api } from '../api.js';
import UserRow from './UserRow.jsx';

export default function Suggestions() {
  const [people, setPeople] = useState(null);

  useEffect(() => {
    api
      .suggestions()
      .then((d) => setPeople(d.users))
      .catch(() => setPeople([]));
  }, []);

  if (people && people.length === 0) return null;

  return (
    <section className="card side-card">
      <h4>People to follow</h4>
      {!people && <p className="muted small">Finding bright minds…</p>}
      {people?.map((p) => (
        <UserRow key={p._id} person={p} />
      ))}
    </section>
  );
}
