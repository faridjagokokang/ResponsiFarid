DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    prodi VARCHAR(100),
    fakultas VARCHAR(100),
    kampus VARCHAR(100),
    foto_url TEXT,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE courses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    course_name VARCHAR(100) NOT NULL,
    lecturer VARCHAR(100) NOT NULL,
    credits INT NOT NULL,
    semester INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE schedules (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL,
    day VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    deadline DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE push_subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO users(name,email,password,role)
VALUES
('Farid','farid@gmail.com','$2b$10$DrRA8673yfdPQ9A5kD45Guj8VpxcL/TuI0F9LJQ6HblkATes8v5Iq','admin');

INSERT INTO courses(user_id,course_name,lecturer,credits,semester)
VALUES
(1,'Basis Data','Bu Sinta',3,4),
(1,'Pemrograman Web','Pak Andi',3,4);

INSERT INTO schedules(course_id,day,start_time,end_time,room)
VALUES
(1,'Senin','08:00','09:40','Lab 1'),
(2,'Selasa','13:00','14:40','Lab 2');

INSERT INTO assignments(course_id,title,description,deadline,status)
VALUES
(1,'Membuat ERD','Desain Database','2026-07-10','Pending'),
(2,'CRUD Express','Node.js + PostgreSQL','2026-07-15','Pending');