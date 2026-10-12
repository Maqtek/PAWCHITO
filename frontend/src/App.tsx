import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './layouts/Layout';
import { MyPet } from './pages/MyPet';
import { CareInbox } from './pages/CareInbox';
import { CareJourney } from './pages/CareJourney';
import { PetMemory } from './pages/PetMemory';
import { MedicalRecords } from './pages/MedicalRecords';
import './pages/Pages.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<MyPet />} />
          <Route path="/care-inbox" element={<CareInbox />} />
          <Route path="/care-journey" element={<CareJourney />} />
          <Route path="/pet-memory" element={<PetMemory />} />
          <Route path="/medical-records" element={<MedicalRecords />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
