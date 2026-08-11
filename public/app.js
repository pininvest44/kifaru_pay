document.getElementById('stkForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Queuing...';

  const payload = {
    numbersText: document.getElementById('numbersText').value,
    amount: document.getElementById('amount').value,
    accountReference: document.getElementById('accountReference').value,
    description: document.getElementById('description').value
  };

  try {
    const response = await fetch('/api/bulk-stk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to submit batch');

    alert(`${data.message}` + (data.invalidCount > 0 ? ` (${data.invalidCount} invalid numbers skipped)` : ''));
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Start Bulk Push';
  }
});

async function updateDashboard() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    const { total, completed, success, failed } = data.batchStats;
    document.getElementById('statTotal').innerText = total;
    document.getElementById('statDone').innerText = completed;
    document.getElementById('statSuccess').innerText = success;
    document.getElementById('statFailed').innerText = failed;
    document.getElementById('queueCount').innerText = `Queue: ${data.queueLength}`;

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    document.getElementById('progressBar').style.width = `${percent}%`;

    const tbody = document.getElementById('logTableBody');
    if (data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">No transactions recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = data.logs.map(log => {
      let statusBadge = '<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">Pending</span>';
      if (log.status === 'success') statusBadge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">Success</span>';
      if (log.status === 'failed') statusBadge = '<span class="bg-red-100 text-red-800 px-2 py-0.5 rounded font-medium">Failed</span>';

      return `
        <tr class="border-b hover:bg-gray-50">
          <td class="p-2 font-mono">${log.timestamp}</td>
          <td class="p-2 font-mono">${log.phone}</td>
          <td class="p-2 font-semibold">KES ${log.amount}</td>
          <td class="p-2">${statusBadge}</td>
          <td class="p-2 text-gray-600">${log.message}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('Polling error:', e);
  }
}

// Poll every 2 seconds for live status updates
setInterval(updateDashboard, 2000);
