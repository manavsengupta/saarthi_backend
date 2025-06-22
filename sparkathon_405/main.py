import tkinter as tk
from threading import Thread
import time
import csv
from DroneBlocksTelloSimulator.DroneBlocksSimulatorContextManager import DroneBlocksSimulatorContextManager
from tkinter import simpledialog, messagebox

SIM_KEY = '56c70fa4-7670-43ce-a3bf-f59dafa6190d'
CSV_FILE = 'tello_positions.csv'
MOVE_DIST = 20  # cm (Tello API uses cm)
WAIT_AFTER_MOVE = 2  # seconds

class DroneGUI:
    def __init__(self, master):
        self.master = master
        master.title("DroneBlocks Tello Simulator Control")

        self.position_label = tk.Label(master, text="Height: 0cm | Pitch: 0° | Roll: 0° | Yaw: 0°", font=("Consolas", 14))
        self.position_label.pack(pady=10)

        # Movement buttons
        btn_frame = tk.Frame(master)
        btn_frame.pack()
        tk.Button(btn_frame, text="Up", width=10, command=self.move_up).grid(row=0, column=1, padx=5, pady=5)
        tk.Button(btn_frame, text="Down", width=10, command=self.move_down).grid(row=2, column=1, padx=5, pady=5)
        tk.Button(btn_frame, text="Left", width=10, command=self.move_left).grid(row=1, column=0, padx=5, pady=5)
        tk.Button(btn_frame, text="Right", width=10, command=self.move_right).grid(row=1, column=2, padx=5, pady=5)
        tk.Button(btn_frame, text="Forward", width=10, command=self.move_forward).grid(row=1, column=1, padx=5, pady=5)
        tk.Button(btn_frame, text="Backward", width=10, command=self.move_backward).grid(row=3, column=1, padx=5, pady=5)

        # Yaw and Flip buttons
        yaw_flip_frame = tk.Frame(master)
        yaw_flip_frame.pack(pady=5)
        tk.Button(yaw_flip_frame, text="Yaw Left 45°", width=12, command=self.yaw_left).grid(row=0, column=0, padx=5, pady=5)
        tk.Button(yaw_flip_frame, text="Yaw Right 45°", width=12, command=self.yaw_right).grid(row=0, column=1, padx=5, pady=5)
        tk.Button(yaw_flip_frame, text="Flip Left", width=10, command=self.flip_left).grid(row=1, column=0, padx=5, pady=5)
        tk.Button(yaw_flip_frame, text="Flip Right", width=10, command=self.flip_right).grid(row=1, column=1, padx=5, pady=5)
        tk.Button(yaw_flip_frame, text="Flip Forward", width=12, command=self.flip_forward).grid(row=1, column=2, padx=5, pady=5)
        tk.Button(yaw_flip_frame, text="Flip Backward", width=12, command=self.flip_backward).grid(row=1, column=3, padx=5, pady=5)

        # Advanced commands
        adv_frame = tk.Frame(master)
        adv_frame.pack(pady=5)
        tk.Button(adv_frame, text="Set Speed", width=10, command=self.set_speed).grid(row=0, column=0, padx=5, pady=5)
        tk.Button(adv_frame, text="Fly to XYZ", width=12, command=self.fly_to_xyz).grid(row=0, column=1, padx=5, pady=5)
        tk.Button(adv_frame, text="Fly Curve", width=12, command=self.fly_curve).grid(row=0, column=2, padx=5, pady=5)
        tk.Button(adv_frame, text="Emergency", width=12, command=self.emergency).grid(row=0, column=3, padx=5, pady=5)
        tk.Button(adv_frame, text="Disconnect", width=12, command=self.disconnect).grid(row=0, column=4, padx=5, pady=5)

        # Info buttons
        info_frame = tk.Frame(master)
        info_frame.pack(pady=5)
        tk.Button(info_frame, text="Battery", width=10, command=self.show_battery).grid(row=0, column=0, padx=5, pady=5)
        tk.Button(info_frame, text="Height", width=10, command=self.show_height).grid(row=0, column=1, padx=5, pady=5)
        tk.Button(info_frame, text="Temperature", width=12, command=self.show_temperature).grid(row=0, column=2, padx=5, pady=5)
        tk.Button(info_frame, text="Flight Time", width=12, command=self.show_flight_time).grid(row=0, column=3, padx=5, pady=5)

        # Takeoff and Land buttons
        tk.Button(master, text="Takeoff", width=10, command=self.takeoff).pack(side=tk.LEFT, padx=10, pady=10)
        tk.Button(master, text="Land", width=10, command=self.land).pack(side=tk.RIGHT, padx=10, pady=10)

        # Start simulator in a thread
        self.sim_thread = Thread(target=self.simulator_thread, daemon=True)
        self.sim_thread.start()
        self.cmd_queue = []
        self.drone = None
        self.running = True

        # Open CSV and write header
        try:
            with open(CSV_FILE, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['Time', 'Height', 'Pitch', 'Roll', 'Yaw'])
        except Exception as e:
            print(f"Error opening CSV: {e}")

        # Poll for position updates
        self.master.after(500, self.update_position_label)

    def simulator_thread(self):
        with DroneBlocksSimulatorContextManager(simulator_key=SIM_KEY) as drone:
            self.drone = drone
            while self.running:
                if self.cmd_queue:
                    cmd = self.cmd_queue.pop(0)
                    try:
                        cmd()
                        time.sleep(WAIT_AFTER_MOVE)
                        self.save_position()
                    except Exception as e:
                        print(f"Error executing command: {e}")
                else:
                    time.sleep(0.1)

    def save_position(self):
        if self.drone:
            try:
                h = self.drone.get_height()
                pitch = self.drone.get_pitch()
                roll = self.drone.get_roll()
                yaw = self.drone.get_yaw()
                with open(CSV_FILE, 'a', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow([time.time(), h, pitch, roll, yaw])
            except Exception as e:
                print(f"Error writing to CSV: {e}")

    def update_position_label(self):
        if self.drone:
            try:
                h = self.drone.get_height()
                pitch = self.drone.get_pitch()
                roll = self.drone.get_roll()
                yaw = self.drone.get_yaw()
                self.position_label.config(
                    text=f"Height: {h}cm | Pitch: {pitch}° | Roll: {roll}° | Yaw: {yaw}°"
                )
            except Exception as e:
                self.position_label.config(text="Position: (error)")
        self.master.after(500, self.update_position_label)

    # Button commands (add to queue)
    def move_up(self):
        self.cmd_queue.append(lambda: self.drone.fly_up(MOVE_DIST, 'cm'))
    def move_down(self):
        self.cmd_queue.append(lambda: self.drone.fly_down(MOVE_DIST, 'cm'))
    def move_left(self):
        self.cmd_queue.append(lambda: self.drone.fly_left(MOVE_DIST, 'cm'))
    def move_right(self):
        self.cmd_queue.append(lambda: self.drone.fly_right(MOVE_DIST, 'cm'))
    def move_forward(self):
        self.cmd_queue.append(lambda: self.drone.fly_forward(MOVE_DIST, 'cm'))
    def move_backward(self):
        self.cmd_queue.append(lambda: self.drone.fly_backward(MOVE_DIST, 'cm'))
    def takeoff(self):
        self.cmd_queue.append(lambda: self.drone.takeoff())
    def land(self):
        self.cmd_queue.append(lambda: self.drone.land())

    # Extra features
    def yaw_left(self):
        self.cmd_queue.append(lambda: self.drone.yaw_left(45))
    def yaw_right(self):
        self.cmd_queue.append(lambda: self.drone.yaw_right(45))
    def flip_left(self):
        self.cmd_queue.append(lambda: self.drone.flip_left())
    def flip_right(self):
        self.cmd_queue.append(lambda: self.drone.flip_right())
    def flip_forward(self):
        self.cmd_queue.append(lambda: self.drone.flip_forward())
    def flip_backward(self):
        self.cmd_queue.append(lambda: self.drone.flip_backward())
    def set_speed(self):
        speed = simpledialog.askinteger("Set Speed", "Enter speed (cm/s):", minvalue=10, maxvalue=100)
        if speed:
            self.cmd_queue.append(lambda: self.drone.set_speed(speed))
    def fly_to_xyz(self):
        try:
            x = simpledialog.askinteger("Fly to X", "Enter X (cm):")
            y = simpledialog.askinteger("Fly to Y", "Enter Y (cm):")
            z = simpledialog.askinteger("Fly to Z", "Enter Z (cm):")
            if None not in (x, y, z):
                self.cmd_queue.append(lambda: self.drone.fly_to_xyz(x, y, z, 'cm'))
        except Exception as e:
            messagebox.showerror("Input Error", str(e))
    def fly_curve(self):
        try:
            x1 = simpledialog.askinteger("Curve X1", "Enter X1 (cm):")
            y1 = simpledialog.askinteger("Curve Y1", "Enter Y1 (cm):")
            z1 = simpledialog.askinteger("Curve Z1", "Enter Z1 (cm):")
            x2 = simpledialog.askinteger("Curve X2", "Enter X2 (cm):")
            y2 = simpledialog.askinteger("Curve Y2", "Enter Y2 (cm):")
            z2 = simpledialog.askinteger("Curve Z2", "Enter Z2 (cm):")
            if None not in (x1, y1, z1, x2, y2, z2):
                self.cmd_queue.append(lambda: self.drone.fly_curve(x1, y1, z1, x2, y2, z2, 'cm'))
        except Exception as e:
            messagebox.showerror("Input Error", str(e))
    def emergency(self):
        self.cmd_queue.append(lambda: self.drone.emergency())
    def disconnect(self):
        if self.drone:
            try:
                self.drone.end()
                messagebox.showinfo("Disconnected", "Drone disconnected from simulator.")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to disconnect: {e}")

    # Info buttons
    def show_battery(self):
        if self.drone:
            try:
                bat = self.drone.get_battery()
                messagebox.showinfo("Battery", f"Battery: {bat}%")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to get battery: {e}")
    def show_height(self):
        if self.drone:
            try:
                h = self.drone.get_height()
                messagebox.showinfo("Height", f"Height: {h} cm")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to get height: {e}")
    def show_temperature(self):
        if self.drone:
            try:
                t = self.drone.get_temperature()
                messagebox.showinfo("Temperature", f"Temperature: {t:.1f} °C")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to get temperature: {e}")
    def show_flight_time(self):
        if self.drone:
            try:
                t = self.drone.get_flight_time()
                messagebox.showinfo("Flight Time", f"Flight Time: {t} s")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to get flight time: {e}")

    def on_close(self):
        self.running = False
        self.master.destroy()

if __name__ == '__main__':
    root = tk.Tk()
    gui = DroneGUI(root)
    root.protocol("WM_DELETE_WINDOW", gui.on_close)
    root.mainloop()