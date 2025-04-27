import { useState, useEffect } from 'react';

function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        console.log('Fetching leaderboard');
        const res = await fetch('http://localhost:4000/leaderboard', {
          mode: 'cors',
          credentials: 'include',
        });
        console.log('Leaderboard fetch response:', { status: res.status, statusText: res.statusText });
        if (!res.ok) {
          const text = await res.text();
          console.log('Leaderboard fetch error response:', text.slice(0, 100));
          throw new Error(`HTTP error ${res.status}`);
        }
        const data = await res.json();
        console.log('Leaderboard fetched:', data);
        setLeaderboard(data);
      } catch (err) {
        console.error('Fetch leaderboard error:', err);
      }
    };
    fetchLeaderboard();
  }, []);

  return (
    <div className="w-full max-w-md mb-4">
      <h2 className="text-lg">Leaderboard</h2>
      <ul>
        {leaderboard.map((entry) => (
          <li key={entry.rank} className="py-1">
            {entry.rank}. {entry.player}: {entry.score} correct guesses
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Leaderboard;