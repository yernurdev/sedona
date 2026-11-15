FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=build /out/api /app/api
COPY data /app/data
ENV DATA_DIR=/app/data DB_PATH=/data/sedona.db PORT=8080
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/api"]
