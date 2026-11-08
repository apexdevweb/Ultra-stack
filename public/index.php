<?php
if (session_status() === PHP_SESSION_NONE) { // Si le status de la session est fixé sur None alor on démarre la session de manière sécurisée
	require __DIR__ . "/../app/core/security/session_secure.php"; // Si la session sécurisé n'est pas démarrer on la lance par rapport à la condition si dessus ↑↑↑
};
require_once __DIR__ . "/../app/core/security/Csrf.php"; //Empêche l'attaque CRF(Cross-Site Request Forgery)
require_once __DIR__ . "/../app/core/security/Encryptor.php"; // import de la fonction de chiffrement pour URL et diverses données 
require __DIR__ . "/../app/core/security/csp.php"; // import du standar de sécurité CSP configurer
header("Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"); //Force le HTTPS pendant 1 an, inclut les sous-domaines
header("Cache-Control: no-cache, no-store, must-revalidate"); // sécurité maximale garantit la confidentialité de la session, interdit formellement au navigateur d'enregistrer la page sur le disque dur (même dans les fichiers temporaires)
header("Pragma: no-cache"); // garantit que même sur un vieux système, la page ne sera pas mise en cache.
header("Expires: 0"); // indique de ne jamais servir cette page à quelqu'un d'autre(défense minimaliste contre la Technique de piratage MIDLE-MEN via le cache) et de toujours venir la chercher à la source (notre serveur).
header("Content-Security-Policy:" . $csp); // Autorise uniquement les scripts de notre propre domaine (à configurer pour CDN et API)
header("X-Frame-Options: DENY"); // Empêche l'affichage de notre site dans une iframe (anti-clickjacking)
header("X-Content-Type-Options: nosniff"); // Empêche l'interprétation de fichiers MIME non déclarés
require_once __DIR__ . '/../app/config/UlStConnexion.php'; //Import de la DB
require_once __DIR__ . '/../app/config/DataLink.php'; //Import des constantes avec les liens externe autorisées
require_once __DIR__ . '/../app/config/DataText.php'; //Import des constantes avec les Textes autorisées
require_once __DIR__ . '/../app/config/DataScript.php'; //Import des constantes avec les chemins des scripts fragmenter du site
?>
<!DOCTYPE html>
<html lang="fr">

<head>
	<?php
	require "../app/views/partials/_head.php"; //Import du head(meta données) stocké dans une partielle
	?>
</head>

<body>
	<header class="main__header">
		<?php
		require "../app/views/partials/_header.php"; //Import du header(barre de navigation etc...) stocké dans une partielle
		?>
	</header>
	<main>
		<?php
		require "main.php"; //Import du main(contenu principale) stocké dans un dossier public
		?>
	</main>
	<footer class="main__footer">
		<?php
		require "../app/views/partials/_footer.php"; //Import du footer(pied de page) stocké dans une partielle
		?>
	</footer>
	<!-- ↓↓↓IMPORT DES DIFFERENTS SCRIPTS ET LIENS VIA LES CONTROLLERS↓↓↓ -->
	<?php
	if (isset($scripts_js) && is_array($scripts_js)) { //On vérifie si la variable existe et si c'est un tableau
		foreach ($scripts_js as $scripts_path) { //On boucle en foreach pour l'import dynamique
	?>
			<script src="<?= $scripts_path ?>"></script>
	<?php
		}
	}
	?>
</body>

</html>