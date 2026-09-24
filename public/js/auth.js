// TSS Group 4 - Authentication Logic

document.addEventListener('DOMContentLoaded', () => {
  // If user already has a valid token, check and redirect to dashboard
  const token = localStorage.getItem('tss4_token');
  if (token) {
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        window.location.href = '/index.html';
      }
    })
    .catch(() => {
      // Clear invalid token
      localStorage.removeItem('tss4_token');
      localStorage.removeItem('tss4_user');
    });
  }
});

function switchAuthTab(tab) {
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const alertBox = document.getElementById('auth-alert');

  alertBox.classList.add('hidden');

  if (tab === 'login') {
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');

    tabLogin.className = 'py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 text-[#7A530C] bg-white shadow-sm flex items-center justify-center gap-2';
    tabRegister.className = 'py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 text-[#7A7267] hover:text-[#2B2620] flex items-center justify-center gap-2';
  } else {
    formLogin.classList.add('hidden');
    formRegister.classList.remove('hidden');

    tabRegister.className = 'py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 text-[#7A530C] bg-white shadow-sm flex items-center justify-center gap-2';
    tabLogin.className = 'py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 text-[#7A7267] hover:text-[#2B2620] flex items-center justify-center gap-2';
  }
}

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('auth-alert');
  const alertMsg = document.getElementById('alert-message');
  const alertIcon = document.getElementById('alert-icon');

  alertMsg.textContent = message;
  alertBox.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'border', 'border-red-200', 'bg-emerald-50', 'text-emerald-700', 'border-emerald-200');

  if (type === 'error') {
    alertBox.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
    alertIcon.className = 'fa-solid fa-circle-exclamation mt-0.5 text-base text-red-500';
  } else {
    alertBox.classList.add('bg-emerald-50', 'text-emerald-700', 'border', 'border-emerald-200');
    alertIcon.className = 'fa-solid fa-circle-check mt-0.5 text-base text-emerald-500';
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-regular fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fa-regular fa-eye';
  }
}

function fillDemoCredentials() {
  document.getElementById('login-email').value = 'admin@tssgroup4.com';
  document.getElementById('login-password').value = 'password123';
  showAlert('Demo credentials filled. Click "Sign In" to proceed!', 'success');
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const submitBtn = document.getElementById('btn-login-submit');

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-sm"></i> Signing in...`;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.success) {
      localStorage.setItem('tss4_token', data.token);
      localStorage.setItem('tss4_user', JSON.stringify(data.user));
      showAlert('Login successful! Redirecting to dashboard...', 'success');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 700);
    } else {
      showAlert(data.message || 'Login failed. Please check credentials.');
    }
  } catch (err) {
    console.error(err);
    // If user account doesn't exist yet, offer easy auto-registration
    showAlert('Server unreachable or error logging in.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Sign In to Dashboard</span><i class="fa-solid fa-arrow-right text-xs"></i>`;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const submitBtn = document.getElementById('btn-reg-submit');

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-sm"></i> Creating account...`;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();

    if (data.success) {
      localStorage.setItem('tss4_token', data.token);
      localStorage.setItem('tss4_user', JSON.stringify(data.user));
      showAlert('Account created successfully! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 700);
    } else {
      showAlert(data.message || 'Registration failed.');
    }
  } catch (err) {
    console.error(err);
    showAlert('Server connection error.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Create Account</span><i class="fa-solid fa-check text-xs"></i>`;
  }
}
