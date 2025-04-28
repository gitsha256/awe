function VideoChat() {
  return (
    <div className="w-full max-w-md bg-white p-4 rounded shadow">
      <h2 className="text-xl mb-4">Video Chat</h2>
      <p>Enjoy your conversation!</p>
      <div id="video-container">
        <video id="local-video" autoplay muted></video>
        <video id="remote-video" autoplay></video>
      </div>
    </div>
  );
}

export default VideoChat;
