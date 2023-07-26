// Basic example of using rrweb record and rrweb-player with React.
// 
// We provide two screens, one with some example elements to interact with,
// and one which provides a list of recordings to play back. Recordings are
// defined as a list of events that are grouped by a session ID. Events are
// persisted to IndexedDB, and then loaded from there when the user selects
// a recording to play back.
//
// The default screen is the recordings screen, and there is a button you can
// click to be taken to the example elements screen in a new tab. on loading the
// example elements screen, we generate a new session ID. This session ID is
// passed to rrweb.record() so that all events are grouped by this session ID.
//
// We use React router to provide the two screens, and we use the rrweb-player
// to play back the recordings.
//
// We use Uno CSS for styling, with the default tailwind theme.

import rrwebReplayer from 'rrweb-player';
import * as rrweb from 'rrweb';
import 'rrweb-player/dist/style.css';
import { useRef, useEffect, useState } from 'react';
import { v4 } from 'uuid';
import { HashRouter, Routes, Route, Link, useParams, Navigate } from "react-router-dom";
import html2canvas from 'html2canvas';

const API_ROOT = 'https://5c39zvs723.execute-api.us-east-1.amazonaws.com/prod/'


function App() {
  // At the top level, we use React router to provide two screens, one for
  // the example elements and rrweb recording (RRWebRecordedPage), and one for
  // the recordings list and playback (RecordingsListPage).
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/replay/" />} />
        <Route path="/replay/" element={<RecordingsListPage />} />
        <Route path="/replay/:sessionId" element={<RecordingsListPage />} />
        <Route path="/session" element={<RRWebRecordedPage />} />
      </Routes>
    </HashRouter>
  );
}

const RRWebRecordedPage = () => {
  // A page on which there are some elements to interact with. The page
  // creates a new session ID on load, and then records all events with
  // that session ID into IndexedDB. To give some kind or order, we prefix the
  // sessionID with the current timestamp in an iso1806 format to it's not too 
  // hard to find the most recent session ID. We use a ref to store the session
  // ID so that it doesn't change on re-renders.
  const sessionId = useRef(`${new Date().toISOString()}-${v4()}`);
  const counterRef = useRef(0);

  // Start rrweb recording on load.
  useEffect(() => {
    // Create a recording with a PUT to /recordings/{sessionId}.
    // We take a screenshot of the page and send it to the backend as the
    // screenshot field. We base64 encode the screenshot and send it as a string
    // to the backend. we use html2canvas to take the screenshot.
    html2canvas(document.body).then((canvas) => {
      const screenshot = canvas.toDataURL();

      fetch(`${API_ROOT}/recordings/${sessionId.current}`, {
        method: 'PUT',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId.current,
          screenshot: screenshot,
        })
      });
    })

    rrweb.record({
      async emit(event) {
        // Persist the event to IndexedDB.
        const sequence = counterRef.current++;
        // Send the event to the backend. We need to consider CORS here. We also
        // need to ensure we have set the correct content-type header.
        await fetch(`${API_ROOT}/recordings/${sessionId.current}/events`, {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId.current,
            rrwebEvent: event,
            sequence: sequence,
          })
        });
      },
    });
  })

  return (
    <>
      <h2>Example elements</h2>
      <p>Some example elements to interact with.</p>
      <button className="btn">Click me</button>
      <input className="input" placeholder="Type something" />
      <select className="select">
        <option>Option 1</option>
        <option>Option 2</option>
      </select>
      <div className="checkbox">
        <label>
          <input type="checkbox" />
          <span>Checkbox</span>
        </label>
      </div>
      <div className="radio">
        <label className="radio">
          <input type="radio" name="radio" />
          <span>Radio 1</span>
        </label>
        <label className="radio">
          <input type="radio" name="radio" />
          <span>Radio 2</span>
        </label>
      </div>
    </>
  );
}

type Recordings = {
  Items: {
    sessionId: { "S": string },
    createdAt: { "N": string },
    screenshot: { "S": string },
  }[]
}

const useRecordings = (): { recordings: Recordings } => {
  // Query /recordings/ to get the list of recordings.
  const [recordings, setRecordings] = useState<Recordings>({ Items: [] });

  useEffect(() => {
    fetch(`${API_ROOT}/recordings/`)
      .then((response) => response.json())
      .then((data) => {
        setRecordings(data);
      });
  }, []);

  return { recordings };
}

const useRecordingEvents = (sessionId: string) => {
  // Get the events for a recording from /recordings/{sessionId}/events.
  const [state, setEvents] = useState<{ events: rrweb.EventType[], loading: boolean }>({ events: [], loading: true });

  useEffect(() => {
    // We get JSONL back from the endpoint, pull out each rrwebEvent from each
    // line and create an array of them. There may be no events at all, in which 
    // case we want to set the loading state to true and poll until there are 
    // events.
    const getEvents = () => {
      fetch(`${API_ROOT}/recordings/${sessionId}/events`)
        .then((response) => response.text())
        .then((data) => {
          const events = data.split('\n').filter((line) => line.length > 0).map((line) => {
            const event = JSON.parse(line);
            return event.rrwebEvent;
          });

          if (events.length === 0) {
            // If there are no events, poll until there are.
            console.log('No events yet, polling...')
            setTimeout(getEvents, 1000);
          }

          setEvents({ events: events, loading: false });
        });
    }

    getEvents();
  }, [sessionId]);

  return state;
}

const RecordingsListPage = () => {
  // Page that lists the recordings stored in IndexedDB to the left, and on
  // clicking on one, loads the player to the right. We link to the rrweb
  // recording playground page from here, opening it in a new tab.
  const { recordings } = useRecordings();
  const { sessionId } = useParams();

  return (
    <div className="flex">
      <div className="flex-1">
        <Link target="_blank" to="/session">Open rrweb recording playground</Link>
        <h2>Recordings</h2>
        <ul>
          {recordings.Items.map((recording) => (
            <li key={recording.sessionId.S}>
              <Link to={`/replay/${recording.sessionId.S}`}>{recording.sessionId.S}
                <img src={recording.screenshot.S} width="400px" /></Link>
            </li >
          ))}
        </ul >
      </div >
      <div className="flex-1">
        {sessionId ? (
          <>
            <h2>Player</h2>
            <RRWebPlayerComponent sessionId={sessionId} />
          </>
        ) : (
          <p>Select a recording to play.</p>
        )}
      </div>
    </div >
  );
}

const RRWebPlayerComponent = ({ sessionId }: { sessionId: string }) => {
  // Component to setup the rrweb player, and provide a ref to it to the parent
  // component so it can e.g. add events to it. We create a dedicated element to
  // pass in as the target to rrwebReplayer({target: ...}) and then pass the ref
  // to this player to the parent component.
  const playerElement = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebReplayer | null>(null);
  const { events, loading } = useRecordingEvents(sessionId);

  useEffect(() => {
    if (playerElement.current && events.length > 2) {
      // If we have an element, create the player and set the ref. Note we use
      // live mode as documented here:
      // https://github.com/rrweb-io/rrweb/blob/master/docs/recipes/live-mode.md
      const player = playerRef.current = new rrwebReplayer({
        target: playerElement.current,
        props: {
          events: events,
          autoPlay: true,
        }
      });

      // Start the player.
      player.play();
    }

    return () => {
      // Cleanup the player and remove any elements that rrwebReplayer may have
      // added. I'm not 100% sure how to do this properly, but this seems to
      // work. It's possibly leaking memory though.
      if (playerRef.current) {
        playerRef.current.getReplayer().destroy();
        playerElement.current?.removeChild(playerElement.current?.firstChild!)
        playerRef.current = null;
      }
    }
  }, [playerElement.current, events]);

  // Render the player element
  return (<>
    <div className="rr-block" ref={playerElement} />
    {loading && <p>Loading...</p>}
  </>
  );
}


export default App
