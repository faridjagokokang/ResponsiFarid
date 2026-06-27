// Configuration
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocalhost ? 'http://localhost:3000/api' : '/api'; // Prefix all requests with /api

// UI State Management
const navBtns = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.content-section');

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        
        // Update active classes
        navBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(target).classList.add('active');
        
        // Load data based on section
        loadDataForSection(target);
    });
});

function loadDataForSection(sectionId) {
    switch(sectionId) {
        case 'dashboard-section': fetchAssignments(); break;
        case 'profile-section': fetchProfile(); break;
        case 'courses-section': fetchCourses(); break;
        case 'schedules-section': fetchSchedules(); populateCourseDropdowns(); break;
        case 'assignments-section': fetchAssignments(); populateCourseDropdowns(); break;
        case 'admin-section': fetchAdminUsers(); break;
    }
}

// Toast Notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    
    toast.classList.remove('success', 'error', 'warning', 'info');
    toast.classList.add(type);
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Loading State Helper
function setLoading(buttonId, isLoading) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'Loading...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
    } else {
        btn.textContent = btn.dataset.originalText || 'Submit';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

// Password Visibility Helper
function togglePasswordVisibility(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.classList.remove('fa-eye');
        iconElement.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        iconElement.classList.remove('fa-eye-slash');
        iconElement.classList.add('fa-eye');
    }
}

// Image Preview Helper
function previewImage(event, previewId) {
    const file = event.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            showToast('File harus berupa gambar', 'error');
            event.target.value = ''; // Reset input
            return;
        }
        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            showToast('Ukuran file maksimal 2MB', 'warning');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById(previewId);
            img.src = e.target.result;
            img.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
}

// Form Reset Helpers
function resetForm(formId) {
    document.getElementById(formId).reset();
    const idField = document.querySelector(`#${formId} input[type="hidden"]`);
    if (idField) idField.value = '';
}

// --- AUTH & FETCH WRAPPER ---
async function authFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
        logout();
        throw new Error('Unauthorized');
    }
    return res;
}

function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (token) {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        if (user.role === 'admin') {
            document.getElementById('nav-admin').style.display = 'inline-block';
        } else {
            document.getElementById('nav-admin').style.display = 'none';
        }

        fetchProfile();
        fetchCourses(); // Load courses to populate dropdowns early
        fetchAssignments(); // Load for dashboard stats
    } else {
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
}

function toggleAuth(type) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('forgot-password-section').style.display = 'none';
    document.getElementById('reset-password-section').style.display = 'none';

    if (type === 'login') {
        document.getElementById('login-section').style.display = 'block';
    } else if (type === 'register') {
        document.getElementById('register-section').style.display = 'block';
    } else if (type === 'forgot-password') {
        document.getElementById('forgot-password-section').style.display = 'block';
    } else if (type === 'reset-password') {
        document.getElementById('reset-password-section').style.display = 'block';
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    checkAuth();
}

document.getElementById('btn-logout').addEventListener('click', logout);

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    setLoading('btn-login-submit', true);
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showToast('Berhasil masuk!', 'success');
            checkAuth();
            resetForm('form-login');
        } else {
            showToast(data.error || 'Gagal masuk', 'error');
        }
    } catch (err) {
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        setLoading('btn-login-submit', false);
    }
});

document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', document.getElementById('register-name').value);
    formData.append('email', document.getElementById('register-email').value);
    formData.append('password', document.getElementById('register-password').value);
    formData.append('prodi', document.getElementById('register-prodi').value);
    formData.append('fakultas', document.getElementById('register-fakultas').value);
    formData.append('kampus', document.getElementById('register-kampus').value);
    formData.append('foto', document.getElementById('register-foto').files[0]);

    setLoading('btn-register-submit', true);
    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Pendaftaran berhasil! Silakan masuk.', 'success');
            toggleAuth('login');
            resetForm('form-register');
            document.getElementById('preview-foto').style.display = 'none';
        } else {
            showToast(data.error || 'Gagal mendaftar', 'error');
        }
    } catch (err) {
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        setLoading('btn-register-submit', false);
    }
});

// Forgot & Reset Password Submit
document.getElementById('form-forgot-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    setLoading('btn-forgot-submit', true);
    try {
        const res = await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message, 'success');
            resetForm('form-forgot-password');
            toggleAuth('login');
        } else {
            showToast(data.error || 'Gagal', 'error');
        }
    } catch (err) {
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        setLoading('btn-forgot-submit', false);
    }
});

document.getElementById('form-reset-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('reset-token').value;
    const newPassword = document.getElementById('reset-password').value;
    setLoading('btn-reset-submit', true);
    try {
        const res = await fetch(`${API_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message, 'success');
            toggleAuth('login');
            resetForm('form-reset-password');
            window.history.replaceState({}, document.title, "/");
        } else {
            showToast(data.error || 'Gagal', 'error');
        }
    } catch (err) {
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        setLoading('btn-reset-submit', false);
    }
});

// --- PROFILE ---
async function fetchProfile() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const fotoHtml = user.foto_url ? `<img src="${DOMPurify.sanitize(user.foto_url.startsWith('http') ? user.foto_url : API_URL + user.foto_url)}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 1rem; border: 2px solid var(--primary);">` : '';
        document.getElementById('profile-info').innerHTML = `
            <div style="text-align: center;">${fotoHtml}</div>
            <p><strong>Name:</strong> ${DOMPurify.sanitize(user.name)}</p>
            <p><strong>Email:</strong> ${DOMPurify.sanitize(user.email)}</p>
            <p><strong>Role:</strong> ${DOMPurify.sanitize(user.role)}</p>
            <p><strong>Program Studi:</strong> ${DOMPurify.sanitize(user.prodi || '-')}</p>
            <p><strong>Fakultas:</strong> ${DOMPurify.sanitize(user.fakultas || '-')}</p>
            <p><strong>Kampus:</strong> ${DOMPurify.sanitize(user.kampus || '-')}</p>
        `;
    } catch (error) {
        console.error('Error fetching profile:', error);
    }
}

// --- ADMIN ---
async function fetchAdminUsers() {
    try {
        const res = await authFetch('/admin/users');
        const data = await res.json();
        
        if (!res.ok) {
            showToast(data.error || 'Gagal memuat admin. Silakan coba Keluar dan Masuk kembali.', 'error');
            return;
        }

        const tbody = document.getElementById('tbody-admin');
        tbody.innerHTML = data.map(u => `
            <tr>
                <td>${u.foto_url ? `<img src="${DOMPurify.sanitize(u.foto_url.startsWith('http') ? u.foto_url : API_URL + u.foto_url)}" style="width: 3cm; height: 4cm; border-radius: 4px; object-fit: cover;">` : '-'}</td>
                <td>${DOMPurify.sanitize(u.name)}</td>
                <td>${DOMPurify.sanitize(u.email)}</td>
                <td>${DOMPurify.sanitize(u.prodi || '-')}</td>
                <td>${DOMPurify.sanitize(u.fakultas || '-')}</td>
                <td>${DOMPurify.sanitize(u.kampus || '-')}</td>
                <td><span style="background: ${u.role === 'admin' ? '#fca5a5' : '#818cf8'}; color: black; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${DOMPurify.sanitize(u.role)}</span></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error fetching admin users:', error);
    }
}

// --- CRUD COURSES ---
let cachedCourses = [];

async function fetchCourses() {
    try {
        const res = await authFetch('/courses');
        const courses = await res.json();
        cachedCourses = courses;
        
        const tbody = document.getElementById('tbody-courses');
        tbody.innerHTML = courses.map(course => `
            <tr>
                <td>${course.id}</td>
                <td>${DOMPurify.sanitize(course.course_name)}</td>
                <td>${DOMPurify.sanitize(course.lecturer)}</td>
                <td>${DOMPurify.sanitize(String(course.credits))}</td>
                <td>${DOMPurify.sanitize(String(course.semester))}</td>
                <td class="action-buttons">
                    <button class="btn-edit" onclick="editCourse(${course.id})">Ubah</button>
                    <button class="btn-delete" onclick="deleteCourse(${course.id})">Hapus</button>
                </td>
            </tr>
        `).join('');
        
        populateCourseDropdowns();
    } catch (error) {
        console.error('Error fetching courses:', error);
    }
}

document.getElementById('form-course').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('course-id').value;
    const data = {
        course_name: document.getElementById('course-name').value,
        lecturer: document.getElementById('course-lecturer').value,
        credits: document.getElementById('course-credits').value,
        semester: document.getElementById('course-semester').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/courses/${id}` : `/courses`;

    setLoading('btn-course-submit', true);
    try {
        const res = await authFetch(url, {
            method,
            body: JSON.stringify(data)
        });
        if (res.ok) {
            showToast(id ? 'Mata Kuliah berhasil diperbarui!' : 'Mata Kuliah berhasil ditambahkan!', 'success');
            resetForm('form-course');
            fetchCourses();
        } else {
            const errData = await res.json();
            showToast(errData.error || 'Gagal menyimpan', 'error');
        }
    } catch (error) {
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        setLoading('btn-course-submit', false);
    }
});

async function editCourse(id) {
    try {
        const res = await authFetch(`/courses/${id}`);
        const course = await res.json();
        document.getElementById('course-id').value = course.id;
        document.getElementById('course-name').value = course.course_name;
        document.getElementById('course-lecturer').value = course.lecturer;
        document.getElementById('course-credits').value = course.credits;
        document.getElementById('course-semester').value = course.semester;
    } catch (error) {
        console.error('Error fetching course details:', error);
    }
}

async function deleteCourse(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus mata kuliah ini?')) return;
    try {
        const res = await authFetch(`/courses/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Mata Kuliah dihapus!');
            fetchCourses();
        }
    } catch (error) {
        console.error('Error deleting course:', error);
    }
}

// --- SHARED UI HELPERS ---
function populateCourseDropdowns() {
    const options = cachedCourses.map(c => `<option value="${c.id}">${c.course_name}</option>`).join('');
    
    const schedSelect = document.getElementById('schedule-course-id');
    const assignSelect = document.getElementById('assignment-course-id');
    
    if (schedSelect) schedSelect.innerHTML = options || '<option disabled>No courses available</option>';
    if (assignSelect) assignSelect.innerHTML = options || '<option disabled>No courses available</option>';
}

// --- CRUD SCHEDULES ---
async function fetchSchedules() {
    try {
        const res = await authFetch('/schedules');
        let schedules = await res.json();
        
        const filter = document.getElementById('schedule-filter');
        if (filter && filter.value !== 'All') {
            schedules = schedules.filter(s => s.day === filter.value);
        }

        const tbody = document.getElementById('tbody-schedules');
        tbody.innerHTML = schedules.map(schedule => `
            <tr>
                <td>${schedule.id}</td>
                <td>${DOMPurify.sanitize(schedule.courses?.course_name || 'Unknown')}</td>
                <td>${DOMPurify.sanitize(schedule.day)}</td>
                <td>${DOMPurify.sanitize(schedule.start_time)} - ${DOMPurify.sanitize(schedule.end_time)}</td>
                <td>${DOMPurify.sanitize(schedule.room)}</td>
                <td class="action-buttons">
                    <button class="btn-edit" onclick="editSchedule(${schedule.id})">Ubah</button>
                    <button class="btn-delete" onclick="deleteSchedule(${schedule.id})">Hapus</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        showToast('Terjadi kesalahan memuat jadwal', 'error');
    }
}

document.getElementById('form-schedule').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('schedule-id').value;
    const data = {
        course_id: document.getElementById('schedule-course-id').value,
        day: document.getElementById('schedule-day').value,
        start_time: document.getElementById('schedule-start').value,
        end_time: document.getElementById('schedule-end').value,
        room: document.getElementById('schedule-room').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/schedules/${id}` : `/schedules`;

    setLoading('btn-schedule-submit', true);
    try {
        const res = await authFetch(url, {
            method,
            body: JSON.stringify(data)
        });
        if (res.ok) {
            showToast(id ? 'Jadwal berhasil diperbarui!' : 'Jadwal berhasil ditambahkan!', 'success');
            resetForm('form-schedule');
            fetchSchedules();
        } else {
            const errData = await res.json();
            showToast(errData.error || 'Gagal menyimpan', 'error');
        }
    } catch (error) {
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        setLoading('btn-schedule-submit', false);
    }
});

async function editSchedule(id) {
    try {
        const res = await authFetch(`/schedules/${id}`);
        const schedule = await res.json();
        document.getElementById('schedule-id').value = schedule.id;
        document.getElementById('schedule-course-id').value = schedule.course_id;
        document.getElementById('schedule-day').value = schedule.day;
        document.getElementById('schedule-start').value = schedule.start_time;
        document.getElementById('schedule-end').value = schedule.end_time;
        document.getElementById('schedule-room').value = schedule.room;
    } catch (error) {
        console.error('Error fetching schedule details:', error);
    }
}

async function deleteSchedule(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) return;
    try {
        const res = await authFetch(`/schedules/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Jadwal dihapus!', 'success');
            fetchSchedules();
        }
    } catch (error) {
        showToast('Terjadi kesalahan', 'error');
    }
}

// --- CRUD ASSIGNMENTS ---
let cachedAssignments = [];

async function fetchAssignments() {
    try {
        const res = await authFetch('/assignments');
        cachedAssignments = await res.json();
        renderAssignments();
    } catch (error) {
        console.error('Error fetching assignments:', error);
    }
}

function renderAssignments() {
    let assignments = [...cachedAssignments];
    
    // Calculate Analytics
    const completed = assignments.filter(a => a.status === 'Selesai' || a.status === 'Completed').length;
    const pending = assignments.length - completed;
    const progress = assignments.length === 0 ? 0 : Math.round((completed / assignments.length) * 100);
    
    const statCompleted = document.getElementById('stat-completed');
    if (statCompleted) {
        statCompleted.textContent = completed;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('dashboard-progress').style.width = progress + '%';
        document.getElementById('progress-text').textContent = `Progress Tugas (${progress}%)`;
    }

    // Sorting
    const sort = document.getElementById('assignment-sort');
    if (sort) {
        if (sort.value === 'deadline') {
            assignments.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
        } else if (sort.value === 'status') {
            assignments.sort((a, b) => a.status.localeCompare(b.status));
        }
    }

    const tbody = document.getElementById('tbody-assignments');
    if (tbody) {
        tbody.innerHTML = assignments.map(assignment => {
            const isDone = assignment.status === 'Selesai' || assignment.status === 'Completed';
            const titleStyle = isDone ? 'text-decoration: line-through; color: #9ca3af;' : '';
            return `
            <tr>
                <td><input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleAssignmentStatus(${assignment.id}, this.checked)"></td>
                <td>${DOMPurify.sanitize(assignment.courses?.course_name || 'Unknown')}</td>
                <td style="${titleStyle}">${DOMPurify.sanitize(assignment.title)}</td>
                <td>${DOMPurify.sanitize(assignment.deadline)}</td>
                <td><span style="background: ${isDone ? '#4ade80' : '#fca5a5'}; color: black; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${DOMPurify.sanitize(assignment.status)}</span></td>
                <td class="action-buttons">
                    <button class="btn-edit" onclick="editAssignment(${assignment.id})">Ubah</button>
                    <button class="btn-delete" onclick="deleteAssignment(${assignment.id})">Hapus</button>
                </td>
            </tr>
        `}).join('');
    }
}

async function toggleAssignmentStatus(id, isChecked) {
    const status = isChecked ? 'Selesai' : 'Pending';
    const assignment = cachedAssignments.find(a => a.id === id);
    if (!assignment) return;
    
    const data = {
        course_id: assignment.course_id,
        title: assignment.title,
        description: assignment.description,
        deadline: assignment.deadline,
        status: status
    };

    try {
        const res = await authFetch(`/assignments/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        if (res.ok) {
            fetchAssignments();
        } else {
            showToast('Gagal mengubah status', 'error');
        }
    } catch (error) {
        showToast('Terjadi kesalahan koneksi', 'error');
    }
}

document.getElementById('form-assignment').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('assignment-id').value;
    const data = {
        course_id: document.getElementById('assignment-course-id').value,
        title: document.getElementById('assignment-title').value,
        description: document.getElementById('assignment-desc').value,
        deadline: document.getElementById('assignment-deadline').value,
        status: document.getElementById('assignment-status').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/assignments/${id}` : `/assignments`;

    setLoading('btn-assignment-submit', true);
    try {
        const res = await authFetch(url, {
            method,
            body: JSON.stringify(data)
        });
        if (res.ok) {
            showToast(id ? 'Tugas berhasil diperbarui!' : 'Tugas berhasil ditambahkan!', 'success');
            resetForm('form-assignment');
            fetchAssignments();
        } else {
            const errData = await res.json();
            showToast(errData.error || 'Gagal menyimpan', 'error');
        }
    } catch (error) {
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        setLoading('btn-assignment-submit', false);
    }
});

async function editAssignment(id) {
    try {
        const res = await authFetch(`/assignments/${id}`);
        const assignment = await res.json();
        document.getElementById('assignment-id').value = assignment.id;
        document.getElementById('assignment-course-id').value = assignment.course_id;
        document.getElementById('assignment-title').value = assignment.title;
        document.getElementById('assignment-desc').value = assignment.description;
        document.getElementById('assignment-deadline').value = assignment.deadline;
        document.getElementById('assignment-status').value = assignment.status;
    } catch (error) {
        console.error('Error fetching assignment details:', error);
    }
}

async function deleteAssignment(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus tugas ini?')) return;
    try {
        const res = await authFetch(`/assignments/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Tugas dihapus!', 'success');
            fetchAssignments();
        }
    } catch (error) {
        showToast('Terjadi kesalahan', 'error');
    }
}

// --- PWA & SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('Service Worker Registered!', reg))
            .catch(err => console.error('Service Worker Registration Failed!', err));
    });
}

// --- PUSH NOTIFICATIONS ---
async function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

document.getElementById('btn-subscribe').addEventListener('click', async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Push notifications are not supported by your browser.');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            alert('Permission not granted for Notification');
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        
        // Get public key from backend
        const keyRes = await fetch(`${API_URL}/vapid-public-key`);
        const { publicKey } = await keyRes.json();
        
        const convertedVapidKey = urlBase64ToUint8Array(publicKey);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
        });

        // We don't need to ask for user ID anymore, it's inferred from JWT!
        const subscribeRes = await authFetch(`/subscribe`, {
            method: 'POST',
            body: JSON.stringify({
                subscription: subscription
            })
        });

        if (subscribeRes.ok) {
            showToast('Successfully subscribed to push notifications!');
        } else {
            console.error('Failed to subscribe on backend');
        }
    } catch (error) {
        console.error('Error subscribing to push notifications:', error);
    }
});

// Initial boot
const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get('token');
if (resetToken) {
    document.getElementById('reset-token').value = resetToken;
    toggleAuth('reset-password');
} else {
    checkAuth();
}

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}

// PWA Install Prompt Logic
let deferredPrompt;
const btnInstallPwa = document.getElementById('btn-install-pwa');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    if (btnInstallPwa) {
        btnInstallPwa.style.display = 'inline-block';
    }
});

if (btnInstallPwa) {
    btnInstallPwa.addEventListener('click', async () => {
        if (deferredPrompt) {
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
            // Hide the button
            btnInstallPwa.style.display = 'none';
        }
    });
}

window.addEventListener('appinstalled', () => {
    // Hide the app-provided install promotion
    if (btnInstallPwa) {
        btnInstallPwa.style.display = 'none';
    }
    console.log('PWA was installed');
});


