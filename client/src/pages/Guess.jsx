function Guess({ socket, sessionId, partnerId }) {
  const [result, setResult] = useState(null);

  const submitGuess = (guess) => {
    socket.emit('guess', { sessionId, partnerId, guess });
  };

  useEffect(() => {
    socket.on('guessResult', (data) => {
      setResult(data.correct ? 'Correct!' : 'Incorrect!');
    });

    return () => {
      socket.off('guessResult');
    };
  }, [socket]);

  return (
    <div className="w-full max-w-md bg-white p-4 rounded shadow">
      <h2 className="text-xl mb-4">Was your partner a Human or AI?</h2>
      <div className="flex space-x-4">
        <button
          onClick={() => submitGuess(true)} // Human
          className="flex-1 bg-green-500 text-white p-2 rounded"
        >
          Human
        </button>
        <button
          onClick={() => submitGuess(false)} // AI
          className="flex-1 bg-red-500 text-white p-2 rounded"
        >
          AI
        </button>
      </div>

      {result && (
        <div className="mt-4">
          <h3>{result}</h3>
        </div>
      )}
    </div>
  );
}

export default Guess;
