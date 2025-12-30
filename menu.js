document.addEventListener("DOMContentLoaded", () => {
  document.body.insertAdjacentHTML("afterbegin", `
    <button id="menuToggle" class="menu-button">☰</button>
    <nav id="dropdownMenu" class="dropdown-menu">
      <a href="index.html">Home</a>
      <a href="commit.html">Commit</a>
      <a href="docs.html">Documentation</a>
    </nav>
  `);

  const menuToggle = document.getElementById('menuToggle');
  const dropdownMenu = document.getElementById('dropdownMenu');

  menuToggle.onclick = () => {
    dropdownMenu.style.display =
      dropdownMenu.style.display === 'flex' ? 'none' : 'flex';
  };

  document.addEventListener('click', (e) => {
    if (!menuToggle.contains(e.target) && !dropdownMenu.contains(e.target)) {
      dropdownMenu.style.display = 'none';
    }
  });
});
