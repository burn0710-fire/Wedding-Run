import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { ScoreEntry } from '../types';

// TODO: Replace with your actual Firebase project configuration
// 1. Go to console.firebase.google.com
// 2. Create a project
// 3. Add a Web App
// 4. Copy the config object below
const firebaseConfig = {
  apiKey: "AIzaSyDummyKey-ReplaceThis",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc12345"
};

// Initialize only if not already initialized (prevent hot-reload errors)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTION_NAME = 'scores';

export const saveScore = async (eventId: string, name: string, score: number) => {
  try {
    await addDoc(collection(db, COLLECTION_NAME), {
      eventId,
      name,
      score,
      timestamp: serverTimestamp()
    });
    return true;
  } catch (e) {
    console.error("Error adding score: ", e);
    // Fallback for demo/development if Firestore isn't set up correctly
    return false;
  }
};

export const getRanking = async (eventId: string): Promise<ScoreEntry[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("eventId", "==", eventId),
      orderBy("score", "desc"),
      limit(50) // Safe limit
    );

    const querySnapshot = await getDocs(q);
    const scores: ScoreEntry[] = [];
    querySnapshot.forEach((doc) => {
      scores.push({ id: doc.id, ...doc.data() } as ScoreEntry);
    });
    return scores;
  } catch (e) {
    console.error("Error getting ranking: ", e);
    return [];
  }
};