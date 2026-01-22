const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const tracks = [
    // Rock
    { id: 'track-1', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', duration_seconds: 355, genre: 'Rock', cover_url: null },
    { id: 'track-2', title: 'Back in Black', artist: 'AC/DC', album: 'Back in Black', duration_seconds: 255, genre: 'Rock', cover_url: null },
    { id: 'track-3', title: "Sweet Child o' Mine", artist: "Guns N' Roses", album: 'Appetite for Destruction', duration_seconds: 356, genre: 'Rock', cover_url: null },
    { id: 'track-4', title: 'Enter Sandman', artist: 'Metallica', album: 'Metallica', duration_seconds: 331, genre: 'Rock', cover_url: null },
    { id: 'track-5', title: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', duration_seconds: 301, genre: 'Rock', cover_url: null },
    { id: 'track-6', title: 'Paranoid Android', artist: 'Radiohead', album: 'OK Computer', duration_seconds: 386, genre: 'Rock', cover_url: null },
    { id: 'track-7', title: 'Hotel California', artist: 'Eagles', album: 'Hotel California', duration_seconds: 390, genre: 'Rock', cover_url: null },
    { id: 'track-8', title: 'Come As You Are', artist: 'Nirvana', album: 'Nevermind', duration_seconds: 219, genre: 'Rock', cover_url: null },

    // Pop
    { id: 'track-9', title: 'Billie Jean', artist: 'Michael Jackson', album: 'Thriller', duration_seconds: 294, genre: 'Pop', cover_url: null },
    { id: 'track-10', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', duration_seconds: 200, genre: 'Pop', cover_url: null },
    { id: 'track-11', title: 'Rolling in the Deep', artist: 'Adele', album: '21', duration_seconds: 228, genre: 'Pop', cover_url: null },
    { id: 'track-12', title: 'Bad Guy', artist: 'Billie Eilish', album: 'When We All Fall Asleep, Where Do We Go?', duration_seconds: 194, genre: 'Pop', cover_url: null },
    { id: 'track-13', title: 'Shape of You', artist: 'Ed Sheeran', album: '÷', duration_seconds: 233, genre: 'Pop', cover_url: null },
    { id: 'track-14', title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', album: 'Uptown Special', duration_seconds: 269, genre: 'Pop', cover_url: null },
    { id: 'track-15', title: 'Havana', artist: 'Camila Cabello', album: 'Camila', duration_seconds: 217, genre: 'Pop', cover_url: null },
    { id: 'track-16', title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', duration_seconds: 203, genre: 'Pop', cover_url: null },

    // Electronic
    { id: 'track-17', title: 'One More Time', artist: 'Daft Punk', album: 'Discovery', duration_seconds: 320, genre: 'Electronic', cover_url: null },
    { id: 'track-18', title: 'Harder, Better, Faster, Stronger', artist: 'Daft Punk', album: 'Discovery', duration_seconds: 224, genre: 'Electronic', cover_url: null },
    { id: 'track-19', title: 'Around the World', artist: 'Daft Punk', album: 'Homework', duration_seconds: 435, genre: 'Electronic', cover_url: null },
    { id: 'track-20', title: 'Strobe', artist: 'deadmau5', album: 'For Lack of a Better Name', duration_seconds: 630, genre: 'Electronic', cover_url: null },
    { id: 'track-21', title: 'Opus', artist: 'Eric Prydz', album: 'Opus', duration_seconds: 571, genre: 'Electronic', cover_url: null },
    { id: 'track-22', title: 'Midnight City', artist: 'M83', album: "Hurry Up, We're Dreaming", duration_seconds: 276, genre: 'Electronic', cover_url: null },
    { id: 'track-23', title: 'Windowlicker', artist: 'Aphex Twin', album: 'Windowlicker', duration_seconds: 365, genre: 'Electronic', cover_url: null },
    { id: 'track-24', title: 'Xtal', artist: 'Aphex Twin', album: 'Selected Ambient Works 85–92', duration_seconds: 300, genre: 'Electronic', cover_url: null },

    // Jazz
    { id: 'track-25', title: 'Take Five', artist: 'The Dave Brubeck Quartet', album: 'Time Out', duration_seconds: 324, genre: 'Jazz', cover_url: null },
    { id: 'track-26', title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', duration_seconds: 545, genre: 'Jazz', cover_url: null },
    { id: 'track-27', title: 'Blue in Green', artist: 'Miles Davis', album: 'Kind of Blue', duration_seconds: 329, genre: 'Jazz', cover_url: null },
    { id: 'track-28', title: 'Autumn Leaves', artist: 'Bill Evans Trio', album: 'Portrait in Jazz', duration_seconds: 300, genre: 'Jazz', cover_url: null },
    { id: 'track-29', title: 'Take the A Train', artist: 'Duke Ellington', album: 'The Best of Duke Ellington', duration_seconds: 210, genre: 'Jazz', cover_url: null },
    { id: 'track-30', title: 'My Favorite Things', artist: 'John Coltrane', album: 'My Favorite Things', duration_seconds: 800, genre: 'Jazz', cover_url: null },
    { id: 'track-31', title: 'All Blues', artist: 'Miles Davis', album: 'Kind of Blue', duration_seconds: 690, genre: 'Jazz', cover_url: null },
    { id: 'track-32', title: 'Freddie Freeloader', artist: 'Miles Davis', album: 'Kind of Blue', duration_seconds: 586, genre: 'Jazz', cover_url: null },

    // Classical
    { id: 'track-33', title: 'Clair de Lune', artist: 'Claude Debussy', album: 'Suite bergamasque', duration_seconds: 300, genre: 'Classical', cover_url: null },
    { id: 'track-34', title: 'Gymnopédie No.1', artist: 'Erik Satie', album: 'Gymnopédies', duration_seconds: 210, genre: 'Classical', cover_url: null },
    { id: 'track-35', title: 'Nocturne Op.9 No.2', artist: 'Frédéric Chopin', album: 'Nocturnes', duration_seconds: 270, genre: 'Classical', cover_url: null },
    { id: 'track-36', title: 'Moonlight Sonata', artist: 'Ludwig van Beethoven', album: 'Piano Sonatas', duration_seconds: 360, genre: 'Classical', cover_url: null },
    { id: 'track-37', title: 'The Four Seasons: Spring', artist: 'Antonio Vivaldi', album: 'The Four Seasons', duration_seconds: 210, genre: 'Classical', cover_url: null },
    { id: 'track-38', title: 'Swan Lake Theme', artist: 'Pyotr Ilyich Tchaikovsky', album: 'Swan Lake', duration_seconds: 210, genre: 'Classical', cover_url: null },
    { id: 'track-39', title: 'Canon in D', artist: 'Johann Pachelbel', album: 'Canon and Gigue', duration_seconds: 360, genre: 'Classical', cover_url: null },
    { id: 'track-40', title: 'Adagio for Strings', artist: 'Samuel Barber', album: 'Adagio for Strings', duration_seconds: 420, genre: 'Classical', cover_url: null }
  ];

  // Add 180 more generated tracks to reach 220 total
  const genres = ['Rock', 'Pop', 'Electronic', 'Jazz', 'Classical', 'Hip-Hop', 'R&B', 'Indie', 'Country', 'Metal'];
  for (let i = 41; i <= 220; i++) {
    const g = genres[(i - 41) % genres.length];
    tracks.push({
      id: `track-${i}`,
      title: `Demo Track ${i}`,
      artist: `Artist ${((i - 1) % 50) + 1}`,
      album: `Album ${((i - 1) % 25) + 1}`,
      duration_seconds: 120 + ((i * 7) % 360), // 120..479
      genre: g,
      cover_url: null
    });
  }

  await prisma.playlistTrack.deleteMany();
  await prisma.track.deleteMany();

  await prisma.track.createMany({ data: tracks });

  const now = new Date();
  const playlist = [
    { track_id: 'track-33', position: 1.0, votes: 4, added_by: 'Classics', is_playing: true, played_at: now },
    { track_id: 'track-1', position: 2.0, votes: 10, added_by: 'User123', is_playing: false, played_at: null },
    { track_id: 'track-9', position: 3.0, votes: 3, added_by: 'User456', is_playing: false, played_at: null },
    { track_id: 'track-25', position: 4.0, votes: 1, added_by: 'JazzFan', is_playing: false, played_at: null },
    { track_id: 'track-17', position: 5.0, votes: 0, added_by: 'EDMHead', is_playing: false, played_at: null },
    { track_id: 'track-5', position: 6.0, votes: 8, added_by: 'RockLover', is_playing: false, played_at: null },
    { track_id: 'track-27', position: 7.0, votes: -2, added_by: 'SmoothJazz', is_playing: false, played_at: null },
    { track_id: 'track-13', position: 8.0, votes: 2, added_by: 'PopFan', is_playing: false, played_at: null },
    { track_id: 'track-20', position: 9.0, votes: 6, added_by: 'NightOwl', is_playing: false, played_at: null },
    { track_id: 'track-29', position: 10.0, votes: -1, added_by: 'Duke', is_playing: false, played_at: null }
  ];

  for (const item of playlist) {
    await prisma.playlistTrack.create({ data: item });
  }

  console.log(`Seed complete. Tracks inserted: ${tracks.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });