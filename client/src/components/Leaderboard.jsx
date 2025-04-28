import React, { useState, useEffect } from 'react';

function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch('https://awe-backend.onrender.com/leaderboard', {
          mode: 'cors',
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        console.log('Leaderboard fetched:', data);
        setLeaderboard(data);
      } catch (err) {
        console.error('Error fetching leaderboard:', err);
      }
    };

    fetchLeaderboard();
  }, []);

  return (
    <div className="mt-4">
      <h3>Leaderboard</h3>
      <ul>
        {leaderboard.map((entry) => (
          <li key={entry.rank}>
            {entry.rank}. {entry.player} - {entry.score}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Leaderboard;