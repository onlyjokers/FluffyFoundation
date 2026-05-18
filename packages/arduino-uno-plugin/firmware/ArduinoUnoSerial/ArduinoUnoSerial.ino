/*
  Purpose: Arduino UNO firmware for Shugu serial PWM and digital output nodes.
*/

const unsigned long BaudRate = 9600;
const int MaxCommandLength = 64;

String inputBuffer = "";

bool isPwmPin(int pin) {
  return pin == 3 || pin == 5 || pin == 6 || pin == 9 || pin == 10 || pin == 11;
}

bool isDigitalPin(int pin) {
  return pin >= 2 && pin <= 13;
}

void handlePwmCommand(String command) {
  int firstSpace = command.indexOf(' ');
  int secondSpace = command.indexOf(' ', firstSpace + 1);
  if (secondSpace < 0) {
    Serial.println("ERR PWM_FORMAT");
    return;
  }

  int pin = command.substring(firstSpace + 1, secondSpace).toInt();
  if (!isPwmPin(pin)) {
    Serial.println("ERR PWM_PIN");
    return;
  }

  float value = command.substring(secondSpace + 1).toFloat();
  if (value < 0.0 || value > 1.0) {
    Serial.println("ERR PWM_RANGE");
    return;
  }

  pinMode(pin, OUTPUT);
  analogWrite(pin, round(value * 255.0));

  Serial.print("OK PWM ");
  Serial.print(pin);
  Serial.print(" ");
  Serial.println(value, 3);
}

void handleDigitalCommand(String command) {
  int firstSpace = command.indexOf(' ');
  int secondSpace = command.indexOf(' ', firstSpace + 1);
  if (secondSpace < 0) {
    Serial.println("ERR DIGITAL_FORMAT");
    return;
  }

  int pin = command.substring(firstSpace + 1, secondSpace).toInt();
  if (!isDigitalPin(pin)) {
    Serial.println("ERR DIGITAL_PIN");
    return;
  }

  String stateText = command.substring(secondSpace + 1);
  stateText.trim();
  stateText.toUpperCase();
  int state;

  if (stateText == "ON") {
    state = HIGH;
  } else if (stateText == "OFF") {
    state = LOW;
  } else {
    Serial.println("ERR DIGITAL_STATE");
    return;
  }

  pinMode(pin, OUTPUT);
  digitalWrite(pin, state);

  Serial.print("OK DIGITAL ");
  Serial.print(pin);
  Serial.print(" ");
  Serial.println(stateText);
}

void handleCommand(String command) {
  command.trim();
  if (command.length() == 0) {
    return;
  }

  String upper = command;
  upper.toUpperCase();

  if (upper.startsWith("PWM ")) {
    handlePwmCommand(upper);
    return;
  }

  if (upper.startsWith("DIGITAL ")) {
    handleDigitalCommand(upper);
    return;
  }

  Serial.print("ERR UNKNOWN ");
  Serial.println(upper);
}

void setup() {
  Serial.begin(BaudRate);
  Serial.println("READY ARDUINO_UNO_SERIAL");
}

void loop() {
  while (Serial.available() > 0) {
    char incoming = Serial.read();

    if (incoming == '\n') {
      handleCommand(inputBuffer);
      inputBuffer = "";
      continue;
    }

    if (incoming == '\r') {
      continue;
    }

    if (inputBuffer.length() >= MaxCommandLength) {
      inputBuffer = "";
      Serial.println("ERR COMMAND_TOO_LONG");
      continue;
    }

    inputBuffer += incoming;
  }
}
