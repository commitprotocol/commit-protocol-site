document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("menuToggle");
  const menu = document.getElementById("dropdownMenu");

  if (!toggle || !menu) return;

  toggle.addEventListener("click", e => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "flex" ? "none" : "flex";
  });

  document.addEventListener("click", e => {
    if (!menu.contains(e.target) && !toggle.contains(e.target)) {
      menu.style.display = "none";
    }
  });
});
