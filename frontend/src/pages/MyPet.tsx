import { useEffect, useState, type FormEvent } from 'react';
import { defaultPet, type Pet } from '../data/pets';

const petStorageKey = 'pawchito:current-pet';

function readSavedPet(): Pet | null {
  try {
    const value = localStorage.getItem(petStorageKey);
    return value ? (JSON.parse(value) as Pet) : null;
  } catch {
    return null;
  }
}

export function MyPet() {
  const [pet, setPet] = useState<Pet>(() => readSavedPet() ?? defaultPet);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    if (readSavedPet()) return;
    const controller = new AbortController();
    fetch('/api/pets/current', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Pet>;
      })
      .then((data) => { if (data?.name) setPet(data); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error('Ошибка загрузки питомца:', error);
      });
    return () => controller.abort();
  }, []);

  function addPet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const breed = String(form.get('breed') ?? '').trim();
    const age = String(form.get('age') ?? '').trim();
    if (!name || !breed || !age) return;
    const nextPet: Pet = { ...defaultPet, id: String(Date.now()), name, breed, age };
    setPet(nextPet);
    try { localStorage.setItem(petStorageKey, JSON.stringify(nextPet)); }
    catch { /* приватный режим */ }
    setIsDialogOpen(false);
  }

  return (
    <div className="home-page">
      <header className="page-header">
        <h1 className="page-title">Рады видеть вас снова!</h1>
        <button className="btn-primary" type="button" onClick={() => setIsDialogOpen(true)}>
          + Добавить питомца
        </button>
      </header>

      <section className="pet-card" aria-label="Карточка питомца">
        <div className="pet-avatar">
          <img src="/images/dog-superhero.webp" alt="Майло" />
        </div>
        <div className="pet-info">
          <div className="pet-name-row">
            <h2>{pet.name}</h2>
            <span className="pet-type-badge">{pet.type}</span>
          </div>
          <p className="pet-meta">{pet.breed} · {pet.age}</p>
          <p className="pet-status">{pet.status}</p>
          <div className="pet-tags" aria-label="Этапы ухода">
            {pet.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
          </div>
        </div>
      </section>

      <div className="content-columns">
        <section className="content-card" aria-label="Мой питомец">
          <h2>Мой питомец</h2>
        </section>
        <aside className="notes-panel" aria-label="Заметки">
          <h2>Заметки</h2>
        </aside>
      </div>

      {isDialogOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setIsDialogOpen(false); }}
        >
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="pet-dialog-title">
            <div className="dialog-heading">
              <h2 id="pet-dialog-title">Добавить питомца</h2>
              <button className="dialog-close" type="button" aria-label="Закрыть" onClick={() => setIsDialogOpen(false)}>×</button>
            </div>
            <form className="pet-form" onSubmit={addPet}>
              <label>Кличка <input name="name" autoFocus required maxLength={50} /></label>
              <label>Порода <input name="breed" required maxLength={80} /></label>
              <label>Возраст <input name="age" required maxLength={35} /></label>
              <button type="submit" className="btn-primary">Сохранить</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
