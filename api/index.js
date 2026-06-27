import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import multer from "multer";
import rateLimit from "express-rate-limit";
import nodemailer from "nodemailer";

// Setup Multer for memory uploads (Supabase Storage)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Setup Web Push
webpush.setVapidDetails(
  process.env.VAPID_CONTACT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to authenticate token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// --- AUTH (LOGIN / REGISTER) ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { error: "Terlalu banyak percobaan login, silakan coba lagi setelah 15 menit." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post("/api/auth/register", upload.single("foto"), async (req, res) => {
  const { name, email, password, prodi, fakultas, kampus } = req.body;
  if (!name || !email || !password || !prodi || !fakultas || !kampus || !req.file) {
    return res.status(400).json({ error: "Semua field dan foto harus diisi" });
  }

  let foto_url = '';
  try {
    const fileName = `profile_${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
    const { data: storageData, error: storageError } = await supabase
        .storage
        .from('avatars')
        .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
        });
        
    if (storageError) {
        return res.status(500).json({ error: "Gagal mengunggah foto profil: " + storageError.message });
    }
    
    // Get public URL
    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    foto_url = publicUrlData.publicUrl;
  } catch(err) {
      return res.status(500).json({ error: "Server error saat upload" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from("users").insert([{ 
      name, email, password: hashedPassword, prodi, fakultas, kampus, foto_url 
    }]).select();
    
    if (error) {
        if (error.code === '23505') return res.status(400).json({ error: "Email sudah terdaftar" });
        return res.status(500).json({ error: error.message });
    }
    
    res.status(201).json({ message: "Registrasi berhasil", user: { id: data[0].id, name: data[0].name, email: data[0].email } });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email dan password harus diisi" });

  const { data: user, error } = await supabase.from("users").select("*").eq("email", email).single();
  
  if (error || !user) return res.status(400).json({ error: "Email atau password salah" });

  try {
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Email atau password salah" });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, foto_url: user.foto_url, prodi: user.prodi, fakultas: user.fakultas, kampus: user.kampus } });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// --- FORGOT PASSWORD ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email harus diisi" });

  const { data: user, error } = await supabase.from("users").select("id, email").eq("email", email).single();
  if (error || !user) return res.status(400).json({ error: "Email tidak terdaftar" });

  const resetToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '15m' });
  
  try {
    if(process.env.SMTP_USER) {
      await transporter.sendMail({
        from: `"StudyTrack Support" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: "Reset Password - StudyTrack",
        text: `Anda meminta reset password. Gunakan token ini untuk reset:\n\n${resetToken}\n\nToken berlaku selama 15 menit.`,
        html: `<p>Anda meminta reset password. Gunakan token di bawah ini untuk reset:</p><p style="padding:10px; background:#f3f4f6; border-radius:4px; font-weight:bold; word-break:break-all;">${resetToken}</p><p>Token berlaku selama 15 menit.</p>`
      });
    } else {
        console.log("Mock Email Sent with Reset Token:", resetToken);
    }
    res.json({ message: "Instruksi reset password telah dikirim ke email Anda. (Cek console log jika SMTP belum diatur)" });
  } catch (err) {
    console.error("Email Error:", err);
    res.status(500).json({ error: "Gagal mengirim email reset" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: "Token dan password baru harus diisi" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const { error } = await supabase.from("users").update({ password: hashedPassword }).eq("id", decoded.id);
    if (error) return res.status(500).json({ error: "Gagal mereset password" });
    
    res.json({ message: "Password berhasil direset. Silakan login." });
  } catch (err) {
    res.status(400).json({ error: "Token tidak valid atau sudah kedaluwarsa" });
  }
});

// --- USERS CRUD ---
app.get("/api/users/me", authenticateToken, async (req, res) => {
  const { data, error } = await supabase.from("users").select("id, name, email").eq("id", req.user.id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- ADMIN ROUTE ---
app.get("/api/admin/users", authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admin only" });
  const { data, error } = await supabase.from("users").select("id, name, email, prodi, fakultas, kampus, foto_url, created_at, role");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/admin/users/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admin only" });
  // Cannot delete yourself
  if (req.user.id === req.params.id) return res.status(400).json({ error: "Cannot delete your own account" });
  
  const { error } = await supabase.from("users").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- COURSES CRUD ---
app.get("/api/courses", authenticateToken, async (req, res) => {
  const { data, error } = await supabase.from("courses").select("*").eq("user_id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/api/courses/:id", authenticateToken, async (req, res) => {
  const { data, error } = await supabase.from("courses").select("*").eq("id", req.params.id).eq("user_id", req.user.id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/courses", authenticateToken, async (req, res) => {
  const { course_name, lecturer, credits, semester } = req.body;
  if (!course_name || !lecturer || !credits || !semester) return res.status(400).json({ error: "Data tidak lengkap" });

  const { data, error } = await supabase.from("courses").insert([{ 
    user_id: req.user.id, 
    course_name, lecturer, credits, semester 
  }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.put("/api/courses/:id", authenticateToken, async (req, res) => {
  const { course_name, lecturer, credits, semester } = req.body;
  const { data, error } = await supabase.from("courses").update({ course_name, lecturer, credits, semester })
    .eq("id", req.params.id).eq("user_id", req.user.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete("/api/courses/:id", authenticateToken, async (req, res) => {
  const { error } = await supabase.from("courses").delete().eq("id", req.params.id).eq("user_id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- SCHEDULES CRUD ---
// Helper to verify course belongs to user
async function verifyUserCourse(course_id, user_id) {
    const { data } = await supabase.from("courses").select("id").eq("id", course_id).eq("user_id", user_id).single();
    return !!data;
}

app.get("/api/schedules", authenticateToken, async (req, res) => {
  // Join with courses, but filter where course belongs to user
  const { data: courses } = await supabase.from("courses").select("id").eq("user_id", req.user.id);
  const courseIds = courses ? courses.map(c => c.id) : [];
  
  if(courseIds.length === 0) return res.json([]);

  const { data, error } = await supabase.from("schedules").select("*, courses(course_name)").in("course_id", courseIds);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/api/schedules/:id", authenticateToken, async (req, res) => {
  const { data, error } = await supabase.from("schedules").select("*, courses!inner(user_id)").eq("id", req.params.id).eq("courses.user_id", req.user.id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/schedules", authenticateToken, async (req, res) => {
  const { course_id, day, start_time, end_time, room } = req.body;
  if (!course_id || !day || !start_time || !end_time) return res.status(400).json({ error: "Data tidak lengkap" });

  if (!(await verifyUserCourse(course_id, req.user.id))) return res.status(403).json({ error: "Invalid course" });

  const { data, error } = await supabase.from("schedules").insert([{ course_id, day, start_time, end_time, room }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.put("/api/schedules/:id", authenticateToken, async (req, res) => {
  const { course_id, day, start_time, end_time, room } = req.body;
  
  const { data: schedule } = await supabase.from("schedules").select("*, courses!inner(user_id)").eq("id", req.params.id).eq("courses.user_id", req.user.id).single();
  if(!schedule) return res.status(403).json({ error: "Unauthorized" });

  if (course_id && !(await verifyUserCourse(course_id, req.user.id))) return res.status(403).json({ error: "Invalid course" });

  const { data, error } = await supabase.from("schedules").update({ course_id, day, start_time, end_time, room }).eq("id", req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete("/api/schedules/:id", authenticateToken, async (req, res) => {
  const { data: schedule } = await supabase.from("schedules").select("*, courses!inner(user_id)").eq("id", req.params.id).eq("courses.user_id", req.user.id).single();
  if(!schedule) return res.status(403).json({ error: "Unauthorized" });

  const { error } = await supabase.from("schedules").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- ASSIGNMENTS CRUD ---
app.get("/api/assignments", authenticateToken, async (req, res) => {
  const { data: courses } = await supabase.from("courses").select("id").eq("user_id", req.user.id);
  const courseIds = courses ? courses.map(c => c.id) : [];
  
  if(courseIds.length === 0) return res.json([]);

  const { data, error } = await supabase.from("assignments").select("*, courses(course_name)").in("course_id", courseIds);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/api/assignments/:id", authenticateToken, async (req, res) => {
  const { data, error } = await supabase.from("assignments").select("*, courses!inner(user_id)").eq("id", req.params.id).eq("courses.user_id", req.user.id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/assignments", authenticateToken, async (req, res) => {
  const { course_id, title, description, deadline, status } = req.body;
  if (!course_id || !title || !deadline) return res.status(400).json({ error: "Data tidak lengkap" });

  const selectedDate = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selectedDate < today) {
    return res.status(400).json({ error: "Tenggat waktu tidak boleh di masa lalu" });
  }

  if (!(await verifyUserCourse(course_id, req.user.id))) return res.status(403).json({ error: "Invalid course" });

  const { data, error } = await supabase.from("assignments").insert([{ course_id, title, description, deadline, status }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.put("/api/assignments/:id", authenticateToken, async (req, res) => {
  const { course_id, title, description, deadline, status } = req.body;
  
  if (deadline) {
    const selectedDate = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      return res.status(400).json({ error: "Tenggat waktu tidak boleh di masa lalu" });
    }
  }
  
  const { data: assignment } = await supabase.from("assignments").select("*, courses!inner(user_id)").eq("id", req.params.id).eq("courses.user_id", req.user.id).single();
  if(!assignment) return res.status(403).json({ error: "Unauthorized" });

  if (course_id && !(await verifyUserCourse(course_id, req.user.id))) return res.status(403).json({ error: "Invalid course" });

  const { data, error } = await supabase.from("assignments").update({ course_id, title, description, deadline, status }).eq("id", req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete("/api/assignments/:id", authenticateToken, async (req, res) => {
  const { data: assignment } = await supabase.from("assignments").select("*, courses!inner(user_id)").eq("id", req.params.id).eq("courses.user_id", req.user.id).single();
  if(!assignment) return res.status(403).json({ error: "Unauthorized" });

  const { error } = await supabase.from("assignments").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- PUSH NOTIFICATIONS ---
app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post("/api/subscribe", authenticateToken, async (req, res) => {
  const { subscription } = req.body;
  
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: "Invalid subscription object" });
  }

  const { endpoint, keys: { p256dh, auth } } = subscription;

  const { data, error } = await supabase.from("push_subscriptions").insert([{
    user_id: req.user.id,
    endpoint,
    p256dh,
    auth
  }]).select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ message: "Subscribed successfully", data: data[0] });
});

app.post("/api/notify", authenticateToken, async (req, res) => {
  const { title, body } = req.body;

  // Sends notification to self (the logged in user)
  const { data: subs, error } = await supabase.from("push_subscriptions").select("*").eq("user_id", req.user.id);
  
  if (error) return res.status(500).json({ error: error.message });
  if (!subs || subs.length === 0) return res.status(404).json({ error: "No subscriptions found" });

  const payload = JSON.stringify({ title, body });

  const notifications = subs.map(sub => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };
    return webpush.sendNotification(pushSubscription, payload).catch(err => console.error("Error pushing notification", err));
  });

  await Promise.all(notifications);

  res.status(200).json({ message: "Notifications sent" });
});

// --- VERCEL CRON JOB (Every day at 08:00 AM) ---
app.get('/cron', async (req, res) => {
  console.log("Menjalankan cron job untuk pengingat tugas besok...");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Get all assignments due tomorrow that are not finished
  const { data: assignments, error } = await supabase
    .from("assignments")
    .select("*, courses(user_id, course_name)")
    .eq("deadline", tomorrowStr)
    .neq("status", "Selesai");

  if (error || !assignments || assignments.length === 0) {
      return res.status(200).json({ message: "No assignments due tomorrow" });
  }

  for (const task of assignments) {
    const userId = task.courses.user_id;
    const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("user_id", userId);
    if (!subs || subs.length === 0) continue;

    const payload = JSON.stringify({ 
      title: "Pengingat Deadline Besok!", 
      body: `Tugas ${task.title} untuk mata kuliah ${task.courses.course_name} harus dikumpulkan besok.`
    });

    subs.forEach(sub => {
      const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      webpush.sendNotification(pushSubscription, payload).catch(err => console.error("Error pushing notification via cron", err));
    });
  }

  res.status(200).json({ message: "Cron executed successfully" });
});

export default app;
