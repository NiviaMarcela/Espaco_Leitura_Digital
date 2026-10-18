const livros = document.querySelectorAll(".livro");

// Mostrar todos
document.getElementById("todosLivros").addEventListener("click", () => {
    livros.forEach(livro => {
        livro.style.display = "";
    });
});

// Infantil
document.getElementById("catInfantil").addEventListener("click", () => {
    livros.forEach(livro => {
        livro.style.display =
            livro.classList.contains("infantil") ? "" : "none";
    });
});

// Juvenil
document.getElementById("catJuvenil").addEventListener("click", () => {
    livros.forEach(livro => {
        livro.style.display =
            livro.classList.contains("juvenil") ? "" : "none";
    });
});

// Literatura
document.getElementById("catLiteratura").addEventListener("click", () => {
    livros.forEach(livro => {
        livro.style.display =
            livro.classList.contains("literatura") ? "" : "none";
    });
});