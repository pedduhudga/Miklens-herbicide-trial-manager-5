export function startVoiceDictation(onResult, onError, onComplete) {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      if (onError) onError('Voice dictation is not supported in this browser.');
      return null;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = function (event) {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
          } else {
              interimTranscript += event.results[i][0].transcript;
          }
      }
      if (onResult) onResult({ finalTranscript, interimTranscript });
  };

  recognition.onerror = function (event) {
      if (onError) onError('Microphone error: ' + event.error);
  };

  recognition.onend = function () {
      if (onComplete) onComplete();
  };

  recognition.start();
  return recognition;
}
