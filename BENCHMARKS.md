# lean-s3 performance benchmarks

Don't trust these tests as they were done on a local machine and a local MinIO instance. You can run them on your machine:
```sh
git clone git@github.com:nikeee/lean-s3.git
cd lean-s3
npm ci
npm run build
cd bench
npm ci

# benchmarks for presigning URLs
npm run bench:presign
# benchmarks for CRUD operations
npm run bench:crud
```

You can use `npm run bench:presign:bun` to run the presign benchmarks using Bun. The CRUD benchmarks don't work using Bun due to some bug that prevents the MinIO testcontainer from starting.

## Presign
![image](https://github.com/user-attachments/assets/711c0338-e67f-4c9e-a127-d15e82032050)

## GetObject / PutObject
![Screenshot From 2025-06-15 19-35-09](https://github.com/user-attachments/assets/9b3d90b9-e1da-48bc-a714-1b6cd1ef2c1a)
![Screenshot From 2025-06-15 19-35-48](https://github.com/user-attachments/assets/1be1ef20-ed31-461f-9809-dd216bb2e2c0)
![Screenshot From 2025-06-15 19-38-49](https://github.com/user-attachments/assets/8f48afbe-f4d2-4e3d-bc0f-6762a2630d13)
![Screenshot From 2025-06-15 19-38-27](https://github.com/user-attachments/assets/7e0f7338-a649-4975-bf58-63a252ccff54)
![Screenshot From 2025-06-15 19-36-14](https://github.com/user-attachments/assets/0f14f61f-037c-4311-91f7-5c0b4aa17486)

## ListObjectsV2
![Screenshot From 2025-06-15 19-36-34](https://github.com/user-attachments/assets/ac947efa-dd69-46e6-b55c-ede518a2a1fe)
