# Sécurité de la base locale Android

Les nouvelles installations Android utilisent SQLCipher pour chiffrer `cmbclub.db`. Une clé aléatoire de 256 bits est conservée dans le trousseau sécurisé du système et n'est pas enregistrée dans SQLite.

Pour préserver les données, une base déjà présente sans clé est ouverte en mode SQLite non chiffré et n'est pas migrée automatiquement. Ces installations restent exposées tant qu'une migration explicite n'est pas réalisée. La suppression de la clé du trousseau rend une base chiffrée irrécupérable.

Le backend Gradle doit être reconstruit après l'activation de SQLCipher dans `package.json`; l'application refuse d'ouvrir la base si le moteur natif ne confirme pas le chiffrement.
