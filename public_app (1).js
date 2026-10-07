const bundleDatabase = [];
let selectedBundle = null;
let currentFilter = 'all';

const adminCredentials = {
  email: 'kanzu@gmail.com',
  password: 'kanzu1234'
};

const apiBase = 'http://localhost:3000';

async function fetchBundles() {
  try {
    const response = await fetch(`${apiBase}/api/products`);
    const bundles = await response.json();
    bundleDatabase.length = 0;
    bundleDatabase.push(...bundles);
    renderBundles();
  } catch (error) {
    console.error('Error loading bundles:', error);
    loadDefaultBundles();
  }
}

function loadDefaultBundles() {
  const defaults = [
    { id: 'daily-1', name: '10MB', category: 'daily', price: 20, details: 'Valid for 1 day' },
    { id: 'daily-2', name: '50MB', category: 'daily', price: 50, details: 'Good for browsing and social media' },
    { id: 'daily-3', name: '100MB', category: 'daily', price: 100, details: 'Affordable daily internet' },
    { id: 'weekly-1', name: '1GB Weekly', category: 'weekly', price: 100, details: '7 days validity' },
    { id: 'weekly-2', name: '2GB Weekly', category: 'weekly', price: 200, details: 'Perfect for work and streaming' },
    { id: 'monthly-1', name: '5GB Monthly', category: 'monthly', price: 500, details: '30 days validity' },
    { id: 'monthly-2', name: '10GB Monthly', category: 'monthly', price: 1000, details: 'Heavy usage package' },
    { id: 'night-1', name: 'Night Bundle', category: 'night', price: 50, details: 'Night browsing package' },
    { id: 'night-2', name: 'Unlimited Night', category: 'night', price: 100, details: 'Unlimited night data' }
  ];

  bundleDatabase.push(...defaults);
  renderBundles();
}

function renderBundles() {
  const visibleBundles =
    currentFilter === 'all'
      ? bundleDatabase
      : bundleDatabase.filter(bundle => bundle.category === currentFilter);

  const grid = document.getElementById('bundleGrid');
  if (!grid) return;

  grid.innerHTML = visibleBundles
    .map(bundle => `
      <article class="bundle-card ${bundle.category}">
        <div class="bundle-type">${bundle.category}</div>
        <h4 class="bundle-name">${bundle.name}</h4>
        <div class="bundle-price">KSh ${bundle.price}</div>
        <div class="bundle-details">${bundle.details}</div>
        <button class="buy-btn" data-id="${bundle.id}">Buy Now</button>
      </article>
    `)
    .join('');

  document.querySelectorAll('.buy-btn').forEach(button => {
    button.addEventListener('click', () => {
      const bundleId = button.getAttribute('data-id');
      const bundle = bundleDatabase.find(item => item.id === bundleId);
      if (bundle) openPurchaseModal(bundle);
    });
  });
}

function filterBundles(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
  renderBundles();
}

function openPurchaseModal(bundle) {
  selectedBundle = bundle;
  document.getElementById('purchaseBundleName').textContent = bundle.name;
  document.getElementById('purchaseBundlePrice').textContent = bundle.price;
  document.getElementById('purchaseBundleDetails').textContent = bundle.details;
  document.getElementById('purchaseModal').classList.remove('hidden');
}

function closePurchaseModal() {
  document.getElementById('purchaseModal').classList.add('hidden');
  document.getElementById('purchaseForm').reset();
  document.getElementById('purchaseStatus').classList.add('hidden');
  document.getElementById('purchaseStatus').textContent = '';
}

async function processPurchase(e) {
  e.preventDefault();

  const phone = document.getElementById('phoneInput').value.trim();
  const validPhone = /^(0|\+254|254)[0-9]{9}$/.test(phone);

  if (!validPhone) {
    const statusBox = document.getElementById('purchaseStatus');
    statusBox.classList.remove('hidden');
    statusBox.textContent = 'Please enter a valid Kenyan phone number.';
    return;
  }

  try {
    const statusBox = document.getElementById('purchaseStatus');
    statusBox.classList.remove('hidden');
    statusBox.textContent = `Processing payment for ${selectedBundle.name}...`;

    const response = await fetch(`${apiBase}/api/payment/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: phone,
        bundleId: selectedBundle.id
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Payment initiation failed');
    }

    statusBox.textContent = 'STK push sent successfully. Please check your phone and enter your MPESA PIN.';
    setTimeout(() => {
      closePurchaseModal();
      showSuccess(selectedBundle);
    }, 1800);
  } catch (error) {
    const statusBox = document.getElementById('purchaseStatus');
    statusBox.classList.remove('hidden');
    statusBox.textContent = `Error: ${error.message}`;
  }
}

function showSuccess(bundle) {
  const successText = document.getElementById('successText');
  successText.textContent = `${bundle.name} purchase initiated. Your bundle will be activated once payment is confirmed.`;
  document.getElementById('successModal').classList.remove('hidden');
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.add('hidden');
}

document.getElementById('adminOpenBtn').addEventListener('click', () => {
  document.getElementById('adminModal').classList.remove('hidden');
});

document.getElementById('closeAdminModal').addEventListener('click', () => {
  document.getElementById('adminModal').classList.add('hidden');
  document.getElementById('adminLoginForm').reset();
  document.getElementById('adminError').classList.add('hidden');
});

document.getElementById('adminLoginForm').addEventListener('submit', function (e) {
  e.preventDefault();

  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value.trim();
  const errorEl = document.getElementById('adminError');

  if (email === adminCredentials.email && password === adminCredentials.password) {
    document.getElementById('adminModal').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    renderAdminPrices();
    document.getElementById('adminLoginForm').reset();
    errorEl.classList.add('hidden');
  } else {
    errorEl.textContent = 'Invalid admin credentials.';
    errorEl.classList.remove('hidden');
  }
});

document.getElementById('logoutAdminBtn').addEventListener('click', () => {
  document.getElementById('adminPanel').classList.add('hidden');
});

function renderAdminPrices() {
  const bundleList = document.getElementById('adminPriceList');

  bundleList.innerHTML = bundleDatabase
    .map(bundle => `
      <div class="admin-price-item">
        <strong>${bundle.name}</strong>
        <label>Price (KSh)</label>
        <input type="number" min="1" value="${bundle.price}" data-id="${bundle.id}" class="price-input" />
        <button class="admin-save-btn" data-id="${bundle.id}">Update Price</button>
      </div>
    `)
    .join('');

  document.querySelectorAll('.admin-save-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-id');
      const input = document.querySelector(`input[data-id="${id}"]`);
      const price = Number(input.value);

      if (!price || price <= 0) {
        alert('Please enter a valid price');
        return;
      }

      try {
        const response = await fetch(`${apiBase}/api/admin/product/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price })
        });

        if (!response.ok) {
          throw new Error('Failed to update price');
        }

        const bundle = bundleDatabase.find(item => item.id === id);
        if (bundle) {
          bundle.price = price;
        }

        renderBundles();
        renderAdminPrices();
        alert('Price updated successfully');
      } catch (error) {
        alert(`Error: ${error.message}`);
      }
    });
  });
}

document.getElementById('purchaseForm').addEventListener('submit', processPurchase);
document.getElementById('closePurchaseModal').addEventListener('click', closePurchaseModal);
document.getElementById('closeSuccessModal').addEventListener('click', closeSuccessModal);
document.getElementById('closeSuccessBtn').addEventListener('click', closeSuccessModal);

document.querySelectorAll('.filter-btn').forEach(button => {
  button.addEventListener('click', () => filterBundles(button.dataset.filter));
});

document.addEventListener('DOMContentLoaded', () => {
  fetchBundles();
});