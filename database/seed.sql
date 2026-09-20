USE la_exquisita_db;

INSERT INTO usuarios (nombre, correo, rol) VALUES
('Marco Rico', 'marcori@gmail.com', 'administrador'),
('Esteban Espitia', 'fawi@gmail.com', 'cajero');

INSERT INTO insumos (nombre, unidad_medida, stock_actual, stock_minimo) VALUES
('Maíz Choclo', 'Kg', 50.00, 10.00),
('Queso Cuajada', 'Kg', 20.00, 5.00),
('Mantequilla', 'Kg', 10.00, 2.00),
('Aceite', 'Litros', 15.00, 3.00);

INSERT INTO productos (nombre, precio, categoria) VALUES
('Arepa de Choclo Tradicional', 6000.00, 'Arepas'),
('Arepa de Choclo con Extra Queso', 8000.00, 'Arepas');

INSERT INTO recetas (id_producto, id_insumo, cantidad_requerida) VALUES
(1, 1, 0.200), -- 200g de Maíz
(1, 2, 0.080), -- 80g de Queso
(1, 3, 0.020); -- 20g de Mantequilla


select * from usuarios;